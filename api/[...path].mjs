/**
 * Sole Vercel /api serverless entry (Hobby: max 12 functions per deployment).
 * Proxies all /api/* → BACKEND_URL (lib/vercel-api-proxy.mjs).
 */
export { default } from '../lib/vercel-api-proxy.mjs';
