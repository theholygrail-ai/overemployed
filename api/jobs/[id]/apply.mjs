/**
 * Explicit route for POST /api/jobs/:id/apply — some Vercel deployments do not match
 * the root api/[...path].mjs catch-all for multi-segment paths (NOT_FOUND on apply).
 */
export { default } from '../../proxy-handler.mjs';
