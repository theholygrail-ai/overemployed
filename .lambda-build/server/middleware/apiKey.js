/**
 * When API_KEY is set on the server, require the same value via
 * Authorization: Bearer <key> or X-API-Key header.
 * If API_KEY is unset, all requests pass (dev / trusted network).
 */
export function requireApiKey(req, res, next) {
  const key = process.env.API_KEY;
  if (!key) return next();

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const headerKey = req.headers['x-api-key'];
  const token = bearer || headerKey;

  if (token !== key) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key for this endpoint',
    });
  }
  next();
}
