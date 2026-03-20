# Deploy frontend on Vercel

The UI is a static **Vite** build. Vercel runs `npm run build` and serves `dist/`.

## One-time setup

1. Push this repo to GitHub (see root README).
2. In [Vercel](https://vercel.com): **Add New Project** → Import the GitHub repository.
3. **Framework Preset**: Other, or Vite (either works with [`vercel.json`](../vercel.json)).
4. **Environment variables** (Production + Preview as needed):

| Name | Example |
|------|--------|
| `VITE_API_URL` | `https://your-api.example.com` (no trailing slash) |
| `VITE_WS_URL` | `wss://your-api.example.com/ws` (optional if same host as API) |
| `VITE_API_KEY` | Same as server `API_KEY` if you enabled API key auth |

5. Deploy. The site will call your **AWS API** for `/api/*` and WebSocket.

## CLI (alternative)

```bash
npm i -g vercel
cd /path/to/overemployed
vercel --prod
```

Link the project to your Vercel account when prompted. Set env vars in the dashboard or `vercel env add`.

## SPA routing

[`vercel.json`](../vercel.json) rewrites unknown paths to `index.html` so React Router works.
