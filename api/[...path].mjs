/**
 * Catch-all /api/* → EC2 (see proxy-handler.mjs).
 * Explicit routes under api/ (e.g. jobs/[id]/apply) also delegate here for Vercel routing edge cases.
 */
export { default } from './proxy-handler.mjs';
