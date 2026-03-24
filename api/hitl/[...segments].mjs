/**
 * Explicit /api/hitl/* → EC2 proxy (Vercel may miss root catch-all for hitl/all, hitl/:id/screenshot, etc.).
 */
export { default } from '../proxy-handler.mjs';
