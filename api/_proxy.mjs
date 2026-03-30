/**
 * Internal entry: vercel.json rewrites all /api/* (except this file) here so one
 * function handles deep paths (api/[...path].mjs only matched one segment).
 */
export { default } from '../lib/vercel-api-proxy.mjs';
