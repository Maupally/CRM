import type { Activity, CrmEvent, Lead, Segment, Task, Template, Stage } from '../shared/domain.ts';

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
  types: string[];
  results: string[];
  counted: string[];
  eventStatus: string[];
  taskStatus: string[];
  segments: (Segment & { leads: number })[];
  templates: Template[];
}

export interface LeadCard {
  lead: Lead;
  activities: Activity[];
  playbook: Segment | null;
  events: CrmEvent[];
}

export type AgendaItem = Activity & { phone?: string; email?: string; stage?: string };

export interface TodayView {
  today: string;
  overdue: AgendaItem[];
  due: AgendaItem[];
  upcoming: AgendaItem[];
  queue: Lead[];
  tasks: Task[];
  events: CrmEvent[];
  doneToday: { activities: number; companies: number };
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

export const api = {
  me: () => get<{ authenticated: boolean; passwordRequired: boolean }>('/me'),
  login: (password: string) => post('/login', { password }),
  logout: () => post('/logout'),

  config: () => get<Config>('/config'),
  today: () => get<TodayView>('/today'),
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

  events: () => get<CrmEvent[]>('/events'),
  saveEvent: (d: Partial<CrmEvent>) => post<CrmEvent>('/events', d),
  deleteEvent: (id: string) => del(`/events/${id}`),
  tasks: () => get<Task[]>('/tasks'),
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
