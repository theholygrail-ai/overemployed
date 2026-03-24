/**
 * Vercel serverless proxy: browser → https://<vercel>/api/* → http(s)://<EC2>/api/*
 * Avoids mixed-content blocking (HTTPS page cannot fetch http:// APIs).
 * Set BACKEND_URL in Vercel (Production) to your API origin, e.g. http://1.2.3.4:4900
 * Leave VITE_API_URL unset so the SPA uses same-origin /api (see src/config.js).
 */
const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildTargetHeaders(req) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    const lower = k.toLowerCase();
    if (HOP.has(lower) || lower === 'host') continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      v.forEach((item) => headers.append(k, item));
    } else {
      headers.set(k, v);
    }
  }
  return headers;
}

export default async function handler(req, res) {
  const backend = (process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
  if (!backend) {
    res.status(503).setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error:
          'BACKEND_URL is not set on Vercel. Add it (server-only env) to your EC2 API origin, e.g. http://x.x.x.x:4900. Unset VITE_API_URL so the app uses this proxy.',
      })
    );
    return;
  }

  const incoming = req.url || '/';
  if (!incoming.startsWith('/api')) {
    res.status(404).end();
    return;
  }

  const targetUrl = `${backend}${incoming}`;

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await getRawBody(req);
  }

  const headers = buildTargetHeaders(req);
  if (body && body.length && !headers.has('content-length')) {
    headers.set('content-length', String(body.length));
  }

  try {
    const r = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.length ? body : undefined,
      redirect: 'manual',
    });

    res.status(r.status);
    const skip = new Set(['content-encoding', 'transfer-encoding', 'connection']);
    r.headers.forEach((value, key) => {
      if (skip.has(key.toLowerCase())) return;
      try {
        res.setHeader(key, value);
      } catch {
        /* ignore invalid response header names */
      }
    });

    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error('[api proxy]', targetUrl, err);
    res.status(502).setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Bad gateway (could not reach BACKEND_URL)',
        detail: String(err?.message || err),
      })
    );
  }
}
