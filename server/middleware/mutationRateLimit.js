import rateLimit from 'express-rate-limit';

/**
 * When `RATE_LIMIT_ENABLED=true`, applies express-rate-limit to mutation methods only.
 * Env: `RATE_LIMIT_WINDOW_MS` (default 60000), `RATE_LIMIT_MAX` (default 120 per window per IP).
 */
export function mutationRateLimitMiddleware() {
  if (process.env.RATE_LIMIT_ENABLED !== 'true') {
    return (req, res, next) => next();
  }

  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const max = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });

  return (req, res, next) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return next();
    }
    return limiter(req, res, next);
  };
}
