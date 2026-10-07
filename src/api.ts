import type { Activity, CrmEvent, Lead, Segment, Task, Template, Stage, KnowledgeItem, Person, Style, Design, DesignSummary, Thread, ThreadSummary, ThreadMessage } from '../shared/domain';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const res = await fetch('/api' + url, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && url !== '/login') window.dispatchEvent(new Event('crm:signed-out'));
    throw new ApiError(res.status, data?.error || `${res.status} ${res.statusText}`);
  }
  return data as T;
}

export const get = <T>(url: string) => req<T>('GET', url);
export const post = <T>(url: string, body?: unknown) => req<T>('POST', url, body ?? {});
export const patch = <T>(url: string, body: unknown) => req<T>('PATCH', url, body);
export const del = <T>(url: string) => req<T>('DELETE', url);

export interface Config {
  owner: string;
  today: string;
  stages: Stage[];
  stageLabels: Record<string, string>;
  types: string[];
  results: string[];
  counted: string[];
  eventStatus: string[];
  taskStatus: string[];
  segments: (Segment & { leads: number })[];
  templates: Template[];
  assistant?: boolean;
  mail?: boolean;
}

export interface LeadCard {
  lead: Lead;
  activities: Activity[];
  playbook: Segment | null;
  events: CrmEvent[];
}

export type AgendaItem = Activity & { phone?: string; email?: string; stage?: string };

export type OpenItem = Activity & { phone: string; email: string; stage: string; city: string; segment: string };

export interface Dashboard {
  today: string;
  overdue: OpenItem[];
  due: OpenItem[];
  upcoming: OpenItem[];
  queue: Lead[];
  pipeline: Record<string, number>;
  tasks: Task[];
  tasksDoneToday: number;
  events: CrmEvent[];
  doneToday: { activities: number; companies: number };
  doneWeek: { activities: number; companies: number };
}

export interface Bucket {
  total: number; byType: Record<string, number>; companies: number; reached: number; noAnswer: number; moves: number;
}

export interface Stats {
  today: string;
  activity: { today: Bucket; week: Bucket; month: Bucket };
  daily: { date: string; byType: Record<string, number> }[];
  pipeline: Record<string, number>;
  segments: ({ name: string; total: number; withPhone: number } & Record<string, number>)[];
  totals: { leads: number; overdue: number; queue: number; noContact: number };
}

export interface FollowUp { date: string; type?: string; note?: string }

export interface Proposal {
  key: string;
  tool: string;
  input: Record<string, any>;
  title: string;
  lines: string[];
  warnings: string[];
}
export interface AssistantTurn { role: 'user' | 'assistant'; text: string }

export const api = {
  assistant: (text: string, history: AssistantTurn[], opts: { leadId?: string; image?: { mediaType: string; data: string };
    spoken?: boolean; attachments?: number[]; containerId?: string; threadId?: number } = {}) =>
    post<{ reply: string; proposals: Proposal[]; files?: KnowledgeItem[]; containerId?: string; savedTo?: { id: number; title: string } }>('/assistant', { text, history, ...opts }),
  threads: () => get<ThreadSummary[]>('/threads'),
  thread: (id: number) => get<Thread>(`/threads/${id}`),
  createThread: (d: { title?: string; mode?: string; source?: string; messages?: Partial<ThreadMessage>[]; updatedAt?: string }) => post<Thread>('/threads', d),
  updateThread: (id: number, d: { title?: string; mode?: string }) => patch<Thread>(`/threads/${id}`, d),
  deleteThread: (id: number) => del(`/threads/${id}`),

  knowledge: () => get<KnowledgeItem[]>('/knowledge'),
  knowledgeItem: (id: number) => get<KnowledgeItem & { text: string }>(`/knowledge/${id}`),
  uploadKnowledge: (file: File, meta: { title?: string; description?: string; tags?: string } = {}) => {
    const f = new FormData();
    f.append('file', file);
    for (const [k, v] of Object.entries(meta)) if (v) f.append(k, v);
    return req<KnowledgeItem>('POST', '/knowledge', f);
  },
  addNote: (d: { title?: string; text: string; description?: string; tags?: string }) => post<KnowledgeItem>('/knowledge', d),
  updateKnowledge: (id: number, d: { title?: string; description?: string; tags?: string; text?: string }) => patch<KnowledgeItem>(`/knowledge/${id}`, d),
  deleteKnowledge: (id: number) => del(`/knowledge/${id}`),
  assistantExecute: (items: { tool: string; input: Record<string, any> }[]) =>
    post<{ results: { ok: boolean; message: string; leadId?: string }[] }>('/assistant/execute', { items }),
  me: () => get<{ authenticated: boolean; passwordRequired: boolean }>('/me'),
  login: (password: string) => post('/login', { password }),
  logout: () => post('/logout'),

  config: () => get<Config>('/config'),
  dashboard: () => get<Dashboard>('/dashboard'),
  openActivities: () => get<OpenItem[]>('/activities?open=1'),
  activities: (from: string, to: string) => get<OpenItem[]>(`/activities?from=${from}&to=${to}`),
  bulk: (d: { ids: string[]; stage?: string; reason?: string; segment?: string; plan?: FollowUp | null }) =>
    post<{ changed: number }>('/leads/bulk', d),
  leads: () => get<Lead[]>('/leads'),
  lead: (id: string) => get<LeadCard>(`/leads/${encodeURIComponent(id)}`),
  createLead: (d: Record<string, string>) => post<Lead>('/leads', d),
  updateLead: (id: string, d: Record<string, string>) => patch<Lead>(`/leads/${encodeURIComponent(id)}`, d),
  deleteLead: (id: string) => del(`/leads/${encodeURIComponent(id)}`),
  setStage: (id: string, stage: string, reason?: string) =>
    post<LeadCard>(`/leads/${encodeURIComponent(id)}/stage`, { stage, reason }),
  log: (id: string, d: {
    type: string; result: string; note?: string; date?: string; stage?: string; reason?: string; followUp?: FollowUp | null;
  }) => post<LeadCard>(`/leads/${encodeURIComponent(id)}/activities`, d),
  complete: (id: number, d: { result: string; note?: string; stage?: string; reason?: string; followUp?: FollowUp | null }) =>
    post<LeadCard>(`/activities/${id}/complete`, d),
  updateActivity: (id: number, d: { date?: string; note?: string; type?: string }) =>
    patch<LeadCard>(`/activities/${id}`, d),
  deleteActivity: (id: number) => del<LeadCard>(`/activities/${id}`),
  agenda: (from: string, to: string) =>
    get<{ activities: Activity[]; events: CrmEvent[]; tasks: Task[] }>(`/agenda?from=${from}&to=${to}`),
  stats: () => get<Stats>('/stats'),
  report: (from: string, to: string) => get<{ from: string; to: string; text: string }>(`/report?from=${from}&to=${to}`),
  reportSummary: (from: string, to: string, notes: string) =>
    post<{ from: string; to: string; text: string; summary: string }>('/report/summary', { from, to, notes }),

  events: () => get<CrmEvent[]>('/events'),
  saveEvent: (d: Partial<CrmEvent>) => post<CrmEvent>('/events', d),
  deleteEvent: (id: string) => del(`/events/${id}`),
  tasks: () => get<Task[]>('/tasks'),
  designs: () => get<DesignSummary[]>('/studio'),
  design: (id: number) => get<Design>(`/studio/${id}`),
  createDesign: (d: { title?: string; kind?: string; fromKnowledge?: number; versions?: { html: string; note?: string }[]; chat?: { role: 'user' | 'assistant'; text: string }[] }) => post<Design>('/studio', d),
  renameDesign: (id: number, d: { title?: string; kind?: string }) => patch<Design>(`/studio/${id}`, d),
  deleteDesign: (id: number) => del(`/studio/${id}`),
  designMessage: (id: number, text: string, attachments: number[] = []) => post<Design>(`/studio/${id}/message`, { text, attachments }),
  restoreDesign: (id: number, version: number) => post<Design>(`/studio/${id}/restore`, { version }),
  saveDesign: (id: number) => post<KnowledgeItem>(`/studio/${id}/save`),
  style: () => get<Style>('/style'),
  saveStyle: (d: Partial<Style>) => req<Style>('PUT', '/style', d),
  learnStyle: (ids: number[], mode: keyof Style, chats: number[] = []) => post<{ text: string }>('/style/learn', { ids, mode, chats }),
  people: () => get<Person[]>('/people'),
  savePerson: (d: Partial<Person>) => post<Person>('/people', d),
  deletePerson: (id: number) => del(`/people/${id}`),
  touchPerson: (id: number) => post<Person>(`/people/${id}/touch`),
  saveTask: (d: Partial<Task>) => post<Task>('/tasks', d),
  toggleTask: (id: string) => post<Task>(`/tasks/${id}/toggle`),
  deleteTask: (id: string) => del(`/tasks/${id}`),

  segments: () => get<(Segment & { leads: number })[]>('/segments'),
  saveSegment: (d: Partial<Segment> & { originalName?: string }) => post<Segment>('/segments', d),
  deleteSegment: (name: string) => del(`/segments/${encodeURIComponent(name)}`),
  templates: () => get<Template[]>('/templates'),
  saveTemplate: (d: Partial<Template> & { originalCode?: string }) => post<Template>('/templates', d),
  deleteTemplate: (code: string) => del(`/templates/${encodeURIComponent(code)}`),
  renderTemplate: (id: string, code: string) =>
    get<{ subject: string; body: string; email: string }>(`/leads/${encodeURIComponent(id)}/template/${encodeURIComponent(code)}`),

  duplicates: () => get<{ id: string; company: string; city: string; phone: string; email: string; stage: string }[][]>('/duplicates'),
  importXlsx: (file: File) => {
    const f = new FormData();
    f.append('file', file);
    f.append('confirm', 'REPLACE');
    return req<Record<string, unknown> & { warnings: string[] }>('POST', '/import', f);
  },
};
