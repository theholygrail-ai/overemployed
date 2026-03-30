/**
 * Vercel serverless proxy → BACKEND_URL (see api/_proxy.mjs).
 * When vercel.json rewrites strip multi-segment paths to /api/_proxy?__p=rest, rebuild /api/… here.
 */
function resolveIncomingPath(req) {
  const raw = req.url || '/';
  const u = new URL(raw, 'https://vercel.local');
  const p = u.searchParams.get('__p');
  if (p === null) {
    return u.pathname + (u.search || '');
  }
  u.searchParams.delete('__p');
  const rest = decodeURIComponent(p).replace(/^\/+/, '');
  const qs = u.searchParams.toString();
  return '/api/' + rest + (qs ? `?${qs}` : '');
}
function resolveBackendUrl() {
  const raw =
    process.env.BACKEND_URL ||
    process.env.API_ORIGIN ||
    process.env.OVEREMPLOYED_BACKEND_URL ||
    '';
  let o = raw.trim().replace(/\/$/, '');
  if (o.endsWith('/api')) o = o.slice(0, -4).replace(/\/$/, '');
  return o;
}

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
  const backend = resolveBackendUrl();
  if (!backend) {
    res.status(503).setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Backend URL is not configured on Vercel.',
        hint:
          'In Vercel: Project → Settings → Environment Variables → add BACKEND_URL (or API_ORIGIN) = http://YOUR_EC2_IP:4900 for Production (and Preview if you use it). Remove or empty VITE_API_URL. Redeploy.',
      })
    );
    return;
  }

  const incoming = resolveIncomingPath(req);
  if (
    !incoming.startsWith('/api') ||
    incoming === '/api/_proxy' ||
    incoming.startsWith('/api/_proxy?')
  ) {
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
