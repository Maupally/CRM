/** Content calendar and partnership backlog — shared by Opal5 and the team's link-only space. */

export const CONTENT_STATUS = ['idea', 'production', 'ready', 'published', 'dropped'] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number];
export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  idea: 'Pomysł', production: 'W produkcji', ready: 'Gotowe', published: 'Opublikowane', dropped: 'Odpuszczone',
};
export const CHANNELS = ['Facebook', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Grupy FB', 'WhatsApp', 'Kinderpedia', 'Newsletter', 'Strona', 'Reklama', 'Inne'] as const;
export const CONTENT_KINDS = ['Post', 'Rolka / wideo', 'Relacja', 'Karuzela', 'Artykuł', 'Mail', 'Reklama', 'Udostępnienie', 'Plakat / grafika', 'Inne'] as const;

export interface ContentItem {
  id: number;
  /** planned publication day; '' = not scheduled yet */
  day: string;
  channel: string;
  kind: string;
  title: string;
  /** the copy, script or brief */
  body: string;
  eventId: string;
  eventTitle?: string;
  owner: string;
  status: ContentStatus;
  /** link to the published post */
  link: string;
  /** how it went: reach, sign-ups, comments */
  result: string;
  publishedOn: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const PARTNER_STATUS = ['idea', 'asked', 'agreed', 'done', 'no'] as const;
export type PartnerStatus = (typeof PARTNER_STATUS)[number];
export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  idea: 'Pomysł', asked: 'Zapytane', agreed: 'Zgoda', done: 'Zrobione', no: 'Nie tym razem',
};

/** Someone we know who could pass our news on — the dance teacher telling her clients about Saturday's workshop. */
export interface PartnerIdea {
  id: number;
  who: string;
  /** how we know them / who they are: „nauczycielka tańca u nas” */
  relation: string;
  /** whom they can reach: „klienci jej szkoły tańca, ok. 200 rodzin” */
  reach: string;
  /** what they could do */
  idea: string;
  contact: string;
  eventId: string;
  eventTitle?: string;
  /** who of us talks to them */
  owner: string;
  status: PartnerStatus;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** A link that opens only the content calendar and the partnership backlog — no access to the rest of Opal5. */
export interface ShareLink { token: string; name: string; createdAt: string; lastUsed: string; revoked: boolean }

export interface ContentReportRow { owner: string; planned: number; ready: number; published: number; late: number }
