/**
 * The CRM as a connector for Claude chats (claude.ai → Settings → Connectors → Add custom connector).
 * A minimal, stateless MCP server over Streamable HTTP: every request is one JSON-RPC message,
 * answered with plain JSON. The secret token in the URL is the key — it changes with the password.
 */
import { createHmac } from 'node:crypto';
import type { Context } from 'hono';
import type { Crm } from './crm.js';
import { Assistant } from './assistant.js';

export const mcpToken = (secret: string) => createHmac('sha256', secret).update('mcp-connector').digest('hex').slice(0, 32);

const INSTRUCTIONS = `CRM Martina (Maple Bear Katowice, partnerstwa B2B, wydarzenia, zespół).
- Zanim coś zapiszesz dla firmy, znajdź ją (find_companies). Ludzie (dyrektor, Patryk, dostawcy, animatorzy…) → get_people.
- Buduj siatkę ludzi na bieżąco: gdy pada imię, którego nie ma w get_people, od razu zapisz tę osobę (save_person: kind team/external, rola, firma, services = co robi/zapewnia, event_id gdy chodzi o wydarzenie) — nie czekaj na telefon czy e-mail, o kontakt dopytaj w tej samej odpowiedzi i dopisz go później (save_person z id). Gdy ktoś pomaga przy wydarzeniu — przypnij go (link_person_event z rolą).
- Przy planowaniu wydarzenia rozbij je na potrzeby (animacje, druk z logo, sprzęt, catering, promocja…) i dla każdej sprawdź find_help — podsuń konkretne osoby i firmy z siatki, z tym, co robili wcześniej. Czego nikt nie pokrywa — powiedz wprost i zapytaj, kogo użytkownik zna.
- Każde narzędzie zapisujące od razu zmienia dane w CRM — opisz użytkownikowi, co zapisujesz.
- Gotowe maile zapisuj jako materiały zadania (create_task / update_task): temat w polu subject, w body sama treść, bez linii „Temat:” i bez stopki/podpisu. Adresata ustaw przez person_id (osoba z Zespołu) albo pole to (e-mail).
- Procedury i odpowiedzialność: gdy użytkownik mówi „Patryk ma zrobić X” — zapisz zadanie z person_id. Gdy coś jest częścią ustalonego procesu (get_processes), uruchom procedurę (start_process) zamiast luźnych zadań. Pytania „co ma Patryk”, „gdzie to utknęło” → get_person_work / get_processes(only_stuck). Pilnuj kolejności: krok procesu odhacza się dopiero po poprzednim; gdy coś stoi — zapisz powód (update_task blocked). Gdy użytkownik opisuje, jak coś się u nich robi krok po kroku — zaproponuj zapisanie tego jako procedury (save_process). Przy planowaniu wydarzeń, przeglądzie dnia/tygodnia i gdy get_my_day pokazuje process_suggestions — sprawdź suggest_processes i sam zaproponuj procedurę na podstawie wcześniejszych doświadczeń (z krokami, osobami i terminami), jej uruchomienie albo poprawkę.
- Postępy B2C (rodzice, rekrutacja): b2c_status; gdy użytkownik mówi, ile zrobił → b2c_progress.
- Daty w formacie yyyy-MM-dd; „jutro”, „w piątek” przeliczaj od dzisiejszej daty (get_my_day ją zawiera).`;

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };

/** What claude.ai last did through the connector — shown in Settings → Claude, so problems can be seen. */
export interface McpLast { at: string; tool: string; ok: boolean; error?: string }

async function remember(crm: () => Promise<Crm>, key: string, v: McpLast) {
  try { await (await crm()).setSetting(key, JSON.stringify(v)); } catch { /* the database itself may be what failed */ }
}

export async function lastMcp(crm: Crm): Promise<{ last: McpLast | null; badUrl: McpLast | null }> {
  const read = async (k: string) => { try { return JSON.parse(await crm.setting(k)) as McpLast; } catch { return null; } };
  return { last: await read('mcp.last'), badUrl: await read('mcp.bad') };
}

const STALE = 'Adres konektora Opal5 jest nieaktualny (zmienia się po zmianie hasła). Skopiuj nowy z Opal5 → Ustawienia → Claude i podmień go w claude.ai → Settings → Connectors.';

/** A call to an old address: say so in words Claude can pass on, instead of a bare HTTP error. */
export async function handleStaleMcp(c: Context, crm: () => Promise<Crm>) {
  const msg = await c.req.json<Rpc>().catch(() => null);
  await remember(crm, 'mcp.bad', { at: new Date().toISOString(), tool: String(msg?.method || ''), ok: false, error: 'stary adres' });
  if (msg?.method === 'tools/call' && msg.id !== undefined) {
    return c.json({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: STALE }], isError: true } });
  }
  return c.json({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32001, message: STALE } }, 404);
}

export async function handleMcp(c: Context, crm: () => Promise<Crm>) {
  const msg = await c.req.json<Rpc | Rpc[]>().catch(() => null);
  if (!msg) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map((m) => one(m, crm)))).filter(Boolean);
    return out.length ? c.json(out) : c.body(null, 202);
  }
  const r = await one(msg, crm);
  return r ? c.json(r) : c.body(null, 202);
}

async function one(m: Rpc, crm: () => Promise<Crm>) {
  if (m.id === undefined || m.id === null) return null;          // notification: nothing to answer
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize':
      return ok({
        protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'crm', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: Assistant.mcpTools() });
    case 'tools/call': {
      const tool = String(m.params?.name || '');
      let r: { text: string; isError?: boolean };
      try {
        const a = new Assistant(await crm(), process.env.ANTHROPIC_API_KEY || 'unused');
        r = await a.mcpCall(tool, m.params?.arguments || {});
      } catch (e) {
        // the CRM itself failed (database, timeout): tell Claude what happened instead of a bare server error
        const why = e instanceof Error ? e.message : String(e);
        r = { text: `Opal5 nie odpowiedział poprawnie: ${why}`, isError: true };
      }
      await remember(crm, 'mcp.last', { at: new Date().toISOString(), tool, ok: !r.isError, ...(r.isError ? { error: r.text.slice(0, 300) } : {}) });
      return ok({ content: [{ type: 'text', text: r.text }], ...(r.isError ? { isError: true } : {}) });
    }
    default:
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  }
}
