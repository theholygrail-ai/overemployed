/**
 * vercel.json rewrites all /api/* here (path → ?__p=) so one function proxies
 * deep paths; api/[...path].mjs only matched a single segment on this project.
 */
export { default } from '../lib/vercel-api-proxy.mjs';
