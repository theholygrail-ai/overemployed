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

**Import file:** copy [`vercel.env.example`](../vercel.env.example) to `vercel.env`, replace placeholders, then import/paste into Vercel (see comments at top of that file). `vercel.env` is gitignored.

5. Deploy. The site will call your **AWS API** for `/api/*` and WebSocket.

### EC2 API (this repo’s Docker host)

If the API runs on EC2 (see `docs/DEPLOY-AWS.md` and `scripts/aws-provision/README.md`):

- Example production frontend: [overemployed-five.vercel.app](https://overemployed-five.vercel.app/). Set **`FRONTEND_URL` / `FRONTEND_URLS`** on the API (via `npm run sync:ec2-secrets` + `.env`) so CORS allows that origin.
- Copy **`vercel.production.env`** into Vercel env vars and redeploy (see file for `VITE_API_URL`).
- **`VITE_API_URL` on HTTPS Vercel** must point at an **HTTPS** API (or the browser blocks mixed content). Put **Caddy**, **nginx + Let’s Encrypt**, or **Cloudflare** in front of the EC2 IP, or use a tunnel with TLS. Until then, test the API with **curl** or **local Vite** on `http://localhost:5200` → `http://<EC2_IP>:4900`.
- **`npm run sync:ec2-secrets`** merges local `.env` into AWS Secrets Manager; then SSM refresh (`scripts/aws-provision/ssm-refresh-env.json`) updates `/opt/overemployed/.env` on the instance.

## CLI (alternative)

```bash
npm i -g vercel
cd /path/to/overemployed
vercel --prod
```

Link the project to your Vercel account when prompted. Set env vars in the dashboard or `vercel env add`.

## SPA routing

[`vercel.json`](../vercel.json) rewrites unknown paths to `index.html` so React Router works.
