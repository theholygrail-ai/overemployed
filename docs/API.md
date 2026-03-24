# HTTP API (workflow)

Base URL: your **AWS API** origin — **Lambda Function URL** from SAM (`HttpApiUrl` output), **EC2**, or local dev.  
Example: `https://xxxx.lambda-url.eu-north-1.on.aws` (no trailing slash).  
All paths below are prefixed with that origin.

## Authentication (optional)

If the server sets `API_KEY`, these endpoints require the same value:

- `Authorization: Bearer <API_KEY>`  
- or header `X-API-Key: <API_KEY>`

Protected routes:

- `POST /api/agents/run`
- `POST /api/jobs/:id/apply`

When `API_KEY` is **unset**, those routes remain open (development / trusted networks only).

The Vercel SPA can send the same secret via `VITE_API_KEY` (build-time env) so the browser includes `Authorization: Bearer …` on requests.

---

## Agents (pipeline)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/run` | Start full pipeline (scraping → CV → review → optional auto-apply). Body: optional `{ criteria }`. Returns immediately with `{ status: "started" }`; progress via WebSocket. |
| GET | `/api/agents/status` | `{ status: "running" \| "idle", lastRunResult }` |
| GET | `/api/agents/history` | Orchestrator run history |

## Jobs & metrics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List applications |
| GET | `/api/metrics` | Dashboard metrics |
| GET | `/api/jobs/:id` | Single application |
| GET | `/api/jobs/status/:status` | Filter by status |
| GET | `/api/jobs/:id/cv` | Download tailored CV as `.docx` |
| PATCH | `/api/jobs/:id/status` | Update status JSON `{ status }` |
| DELETE | `/api/jobs/:id` | Delete application |

## Apply (browser automation)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs/:id/apply` | Run applicator (Nova Act / Playwright) for `applicationId` |

## Schedule

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedule` | Current cron config |
| POST | `/api/schedule` | Set schedule `{ cron \| cronExpression, enabled }` |
| DELETE | `/api/schedule` | Clear schedule |

## Auth (LinkedIn)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/linkedin` | Start OAuth (redirect). **Callback URL must be your API host.** |
| GET | `/api/auth/linkedin/callback` | OAuth callback |
| POST | `/api/auth/linkedin/cookie` | Body `{ cookie }` — save `li_at` |
| GET | `/api/auth/linkedin/status` | Connection + LinkedIn scrape hint |
| DELETE | `/api/auth/linkedin` | Clear stored session |

## Session cookies (automation)

Stored in operator memory (`memory.json` / S3). Applied with `page.setCookie` / Playwright `addCookies` **before** navigating to the job URL.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/session-cookies` | `{ configured, cookieCount, updatedAt }` — no raw values |
| POST | `/api/settings/session-cookies` | Body `{ cookies: string \| array, defaultDomain?: string }`. JSON array: `[{ name, value, domain, path?, ... }]`. Or Cookie-header string `a=b; c=d` with `defaultDomain` e.g. `.adzuna.com` |
| DELETE | `/api/settings/session-cookies` | Revoke all stored session cookies |

## Profile & artifacts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/profile` | User profile JSON |
| PUT | `/api/profile` | Update profile |
| GET | `/api/profile/artifacts` | List uploaded files |
| POST | `/api/profile/artifacts` | Multipart `file` upload |
| DELETE | `/api/profile/artifacts/:filename` | Remove artifact |

## HITL (interventions)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hitl` | Pending blockers |
| GET | `/api/hitl/all` | All blockers |
| GET | `/api/hitl/:id` | One blocker |
| POST | `/api/hitl/:id/resume` | Resume after manual step |
| POST | `/api/hitl/:id/skip` | Skip blocker |
| GET | `/api/hitl/:id/screenshot` | Screenshot image |

## WebSocket

Connect to `ws://host/ws` or `wss://host/ws` (same host as API). Messages mirror agent broadcasts (`agent_log`, `agent:run_complete`, etc.).

---

## Example: trigger pipeline (curl)

```bash
curl -X POST "https://YOUR_API_HOST/api/agents/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{}'
```
