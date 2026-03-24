# Application audit & production readiness

This document tracks **what was verified**, **what was fixed in-repo**, and **what remains** for real-world job-outreach use.

## Verified (automated)

- `npm run build` (Vite) succeeds — frontend bundles for production.
- Backend routes load; critical paths reviewed (see subsections below).

## Fixes applied (this pass)

| Area | Change |
|------|--------|
| **WebSocket** | Single `WebSocketProvider` in `App.jsx` — avoids **N parallel sockets** (one per component) wasting resources and splitting message streams. |
| **Dashboard + Lambda** | Polls `GET /api/agents/status` when WebSocket is unavailable or disconnected, so **Run Now** can complete without WS events. |
| **Agents + Lambda** | `invokeOrchestratorAsync` runs **before** `res.json` — client no longer gets HTTP 200 if Lambda invoke fails. Apply path reverts job status to `ready` on invoke failure. |
| **Jobs API** | `PATCH /api/jobs/:id/status` validates **allowlisted** statuses and returns **404** if the application row does not exist (avoids orphan DynamoDB items). |
| **Profile** | `DELETE .../artifacts/:filename` blocks path traversal in `filename`. |
| **Jobs UI** | Apply failures show an **in-app error banner**; **Title** column sort uses `roleTitle`. |

## Security & compliance (must-haves for real outreach)

1. **`API_KEY` in production** — Without it, most routes are unauthenticated (`server/middleware/apiKey.js`). Only `POST /api/agents/run` and `POST /api/jobs/:id/apply` use `requireApiKey` when set; consider extending protection to mutations you care about.
2. **WebSocket** — No auth on `/ws`; treat as trusted network only or put API behind a gateway with auth.
3. **Rate limiting** — Not implemented; add at API Gateway / ALB / `express-rate-limit` for public URLs.
4. **Secrets** — LinkedIn cookies, OAuth tokens, Groq keys live in memory/S3 (`memory.js`, `s3Json.js`). Use AWS Secrets Manager or SSM for production rotation.
5. **CORS** — Narrow `FRONTEND_URLS` from `*` in production (`server/app.js`).

## Functional gaps (real-world product)

| Gap | Notes |
|-----|--------|
| **LinkedIn ToS / legal** | Automated applying may violate platform terms; legal review is on you. |
| **Reliability of automation** | Selectors, CAPTCHAs, and UI changes break flows; needs monitoring and HITL (`hitl.js`) — already partially there. |
| **Observability** | Add structured logging, metrics, alarms on Lambda errors and Dynamo throttles. |
| **Idempotency** | Double-clicks on Run/Apply can race; consider idempotency keys or UI debouncing. |
| **Settings vs server** | Client “settings” for Groq/criteria in `Settings.jsx` are largely **localStorage**; server uses **env** — document clearly or sync. |
| **Agent Monitor** | Without WebSocket, live log is empty; metrics polling does not backfill agent logs into the UI. |
| **Tests** | Vitest unit tests + CI build; optional E2E can be added separately. |

## Operator checklist before a real campaign

1. Set `API_KEY` / `VITE_API_KEY` and redeploy API + Vercel.
2. Confirm `VITE_API_URL` and LinkedIn cookie / OAuth flow on **production** host.
3. Run one **manual** pipeline + one **apply** with HITL off; verify Dynamo + proof screenshots.
4. Watch CloudWatch (or Lambda logs) for the worker and HTTP function.

## Deploy commands (this project)

- **Frontend:** `npm run deploy:vercel` (or Git push if Vercel Git integration is on).
- **Zip Lambdas (AWS CLI):** `npm run deploy:lambda` — see `scripts/deploy-lambda-aws-cli.ps1`.
- **SAM / container stack:** `npm run build:aws` / `deploy:aws` — only if you use the SAM template in `sam/`, not the Zip Lambdas described above.

---

*Last updated: audit pass with code changes as tracked in git.*
