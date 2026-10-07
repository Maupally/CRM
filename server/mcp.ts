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
- Zanim coś zapiszesz dla firmy, znajdź ją (find_companies). Ludzie z zespołu (dyrektor, Patryk…) → get_people.
- Każde narzędzie zapisujące od razu zmienia dane w CRM — opisz użytkownikowi, co zapisujesz.
- Gotowe maile zapisuj jako materiały zadania (create_task / update_task): temat w polu subject, w body sama treść, bez linii „Temat:” i bez stopki/podpisu. Adresata ustaw przez person_id (osoba z Zespołu) albo pole to (e-mail).
- Opal5 jest głównym miejscem pracy użytkownika. Po każdej odpowiedzi, w której coś przygotowałeś albo coś ustaliliście, zapisz wymianę narzędziem log_chat (ten sam chat_title w całej rozmowie). Strony, prezentacje i szablony w HTML zapisuj w Studio (save_design, ten sam tytuł = nowa wersja). Trwałe ustalenia i gotowe teksty → save_note.
- Daty w formacie yyyy-MM-dd; „jutro”, „w piątek” przeliczaj od dzisiejszej daty (get_my_day ją zawiera).`;

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: any };

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
      const a = new Assistant(await crm(), process.env.ANTHROPIC_API_KEY || 'unused');
      const r = await a.mcpCall(String(m.params?.name || ''), m.params?.arguments || {});
      return ok({ content: [{ type: 'text', text: r.text }], ...(r.isError ? { isError: true } : {}) });
    }
    default:
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } };
  }
}
