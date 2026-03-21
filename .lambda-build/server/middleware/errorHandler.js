export default function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  console.error(`[ERROR] ${req.method} ${req.originalUrl} — ${err.message}`);

  const body = { error: err.message || 'Internal Server Error' };
  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }

  res.status(status).json(body);
}
