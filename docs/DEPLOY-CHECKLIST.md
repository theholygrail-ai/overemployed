# End-to-end deploy checklist (GitHub → Vercel → AWS API)

Run these **on your machine** in order. Interactive steps (`gh auth login`, `vercel login`) cannot be completed from a headless environment.

---

## 1. GitHub: authenticate and push

```powershell
cd F:\overEmployed

# One-time: browser login (GitHub.com)
gh auth login

# Confirm
gh auth status

# Create repo on GitHub and push (change name if taken)
gh repo create overemployed --public --source=. --remote=origin --push
```

If `origin` already exists:

```powershell
git remote remove origin
gh repo create overemployed --public --source=. --remote=origin --push
```

Or push to an existing empty repo:

```powershell
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

More options: [DEPLOY-GITHUB.md](./DEPLOY-GITHUB.md).

---

## 2. Vercel: import project and deploy

### Dashboard (recommended)

1. Open [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. **Import** the GitHub repository you just pushed.
3. **Framework Preset**: Vite (or Other; [`vercel.json`](../vercel.json) still applies).
4. **Environment variables** (Production + Preview as needed):

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://YOUR-EC2-OR-DOMAIN` (no trailing slash; HTTPS required if the site is HTTPS) |
| `VITE_WS_URL` | Optional: `wss://YOUR-EC2-OR-DOMAIN/ws` |
| `VITE_API_KEY` | Optional: same string as server `API_KEY` if you protect `/api/agents/run` |

5. **Deploy**.

### CLI (alternative)

```powershell
cd F:\overEmployed
npx vercel login
npx vercel link
npx vercel env add VITE_API_URL production
npx vercel --prod
```

Details: [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md).

---

## 3. AWS: API on EC2 with Docker

Follow [DEPLOY-AWS.md](./DEPLOY-AWS.md):

- Launch `t3.micro`, security group (SSH + 4900 or 443).
- Install Docker, clone repo, create `.env` on the server (see [.env.example](../.env.example)).
- Set **`FRONTEND_URL`** or **`FRONTEND_URLS`** to your **Vercel** URL (comma-separated if you use preview + production).
- Optional: **`API_KEY`** — match `VITE_API_KEY` on Vercel if used.
- `docker compose up -d --build`

Put **HTTPS** in front of the API (Caddy/nginx/Let’s Encrypt or Cloudflare) so the browser allows `fetch` and **wss** from your Vercel domain.

---

## 4. Smoke tests

```powershell
# API (replace host)
curl.exe -s "https://YOUR_API_HOST/api/metrics"

# With API key (if enabled)
curl.exe -s -H "Authorization: Bearer YOUR_KEY" "https://YOUR_API_HOST/api/metrics"
```

In the browser: open your **Vercel** URL → Dashboard should load metrics; **Run Now** should hit the EC2 API (check Network tab → requests go to `VITE_API_URL`).

---

## 5. LinkedIn OAuth callback

On the API server, set **`LINKEDIN_REDIRECT_URI`** to:

`https://YOUR_API_HOST/api/auth/linkedin/callback`

Register the same URL in the LinkedIn developer app.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors | `FRONTEND_URLS` must include exact Vercel URL(s). |
| WebSocket fails | Use `wss://` and proxy `/ws` with Upgrade headers ([DEPLOY-AWS.md](./DEPLOY-AWS.md)). |
| Mixed content | Vercel is HTTPS → API must be HTTPS, not `http://` IP. |
| 401 on Run Now | Set `VITE_API_KEY` on Vercel = `API_KEY` on server, or remove `API_KEY` on server for dev. |
