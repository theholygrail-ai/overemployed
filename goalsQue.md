# Goals queue — OverEmployed completion mission

**Mission:** Ship a reliable, testable job-automation stack: secure API, stable UI, observable runs, and operator confidence.

**How to use:** Work top → bottom. When a task is done and tested, remove it and append the next priority (or adjust order).

**Stop word:** When the operator says **`Sieze`**, pause autonomous queue execution (typo-tolerant for “cease”).

---

## Queue (next up first)

1. **Persist operator settings via API** — `GET/PUT /api/operator-settings` (S3/memory JSON) for job criteria / display fields; document vs `GROQ_API_KEY` in env.

2. **Observability pack** — structured JSON logs + `docs/OBSERVABILITY.md` (CloudWatch query examples for Lambda).

---

## Completed (archive)

- **2025-03-23** — **Session Helper** Chrome extension, cookie merge API, HITL + Settings UI; Lambda + Vercel redeployed.
- **2025-03-23** — HITL detail `sendAction` checks HTTP `res.ok`.

- **2025-03-22** — Vitest + formatters tests; GitHub CI (unit, build).
- **2025-03-22** — HITL errors + retry; Run/Apply cooldown; deploy env matrix doc.
- **2025-03-22** — `RATE_LIMIT_ENABLED` + mutation rate limit + tests.
- **2025-03-22** — Agent Monitor: REST poll of `/api/agents/status` when WebSocket off/disconnected (coarse log + stages).
