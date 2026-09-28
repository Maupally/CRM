/**
 * Vercel serverless function. vercel.json rewrites every /api/* request here;
 * the original path is preserved, so the Hono router sees /api/leads etc.
 */
import { handle } from 'hono/vercel';
import { appFromEnv } from '../server/app.js';

const handler = handle(appFromEnv());

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
