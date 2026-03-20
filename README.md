# OverEmployed -- Agentic Job Search Application

An autonomous multi-agent system that scrapes job boards, generates tailored CVs, and manages applications -- all from a single dashboard. Built with React Native Web, Vite, Express.js, Groq LLM, and AWS DynamoDB.

---

## Architecture

```
Frontend (React Native Web + Vite)       Backend (Express.js)
┌────────────────────────────┐           ┌──────────────────────────────┐
│  Dashboard (metrics)       │           │  Orchestrator Agent          │
│  Job List (applications)   │  HTTP +   │    ├── Researcher Agent      │
│  Scheduler (cron config)   │◄─────────►│    ├── CV Generator Agent    │
│  Agent Monitor (live)      │  WebSocket│    └── Reviewer Agent        │
│  Settings (API keys)       │           │                              │
└────────────────────────────┘           │  Job Scrapers:               │
                                         │    RemoteOK, Remotive,       │
                                         │    Adzuna, LinkedIn           │
                                         │                              │
                                         │  Services:                    │
                                         │    Groq LLM, DynamoDB,        │
                                         │    Memory, Scheduler          │
                                         └──────────────────────────────┘
                                                      │
                                         ┌────────────┼────────────┐
                                         ▼            ▼            ▼
                                     Groq API    DynamoDB     LinkedIn
                                   (gpt-oss-120b)            OAuth
```

### Agent Pipeline

1. **Orchestrator** loads all 6 context MD files, triggers the pipeline
2. **Researcher** scrapes 4 job boards in parallel, deduplicates, scores each job via LLM
3. **CV Generator** creates a tailored ATS-friendly CV for each matching job
4. **Reviewer** validates CV quality and stores approved applications in DynamoDB

---

## Quick Start

### Prerequisites

- Node.js 18+
- AWS CLI configured (profile: `TheHolyGrail`)
- Groq API key (get one at https://console.groq.com)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required:
- `GROQ_API_KEY` -- your Groq API key

Optional:
- `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` -- register free at https://developer.adzuna.com
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` -- register at https://developer.linkedin.com

### 3. Set up AWS DynamoDB

The DynamoDB table should already exist if you ran the initial setup. To create or verify it:

```bash
npm run setup-aws
```

This creates the `TheHolyGrail-Applications` table with:
- Partition key: `applicationId` (String)
- GSI: `status-index` (filter by application status)
- GSI: `dateFound-index` (sort by discovery date)
- TTL: auto-cleanup after 90 days

### 4. Run the app

```bash
npm run dev
```

This starts:
- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend**: http://localhost:3001 (Express + WebSocket)

Open **http://localhost:5200** in your browser (backend on **http://localhost:4900**).

---

## Production: Vercel + AWS API

- **Frontend (Vercel)**: static build from this repo (`npm run build`). Configure **Environment Variables** in the Vercel project:
  - `VITE_API_URL` — HTTPS origin of your API (no trailing slash), e.g. `https://ec2-xx-xx-xx-xx.compute.amazonaws.com` or your domain
  - `VITE_WS_URL` — optional; defaults to `wss://` + same host as `VITE_API_URL` with path `/ws`
  - `VITE_API_KEY` — optional; must match server `API_KEY` if you enable it
- **Backend (AWS)**: run the Express API on **EC2** with **Docker Compose** — see [docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md). The API is **not** deployed as Vercel serverless functions.
- **GitHub**: initial commit is on branch `main`. Run `gh auth login` then `gh repo create` (see [docs/DEPLOY-GITHUB.md](docs/DEPLOY-GITHUB.md)), or add `origin` and `git push` manually.
- **Full ordered steps** (auth → Vercel → EC2): [docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md).

Full HTTP reference: [docs/API.md](docs/API.md).

---

## Features

### Dashboard
- **Metric cards**: Total Runs, Jobs Found, CVs Ready, Applications Tracked, Last Run
- **Run Now** button to trigger the full pipeline on demand
- **Live Activity** feed showing real-time agent events via WebSocket
- **Run History** with success/failure status

### Job List
- Sortable table of all discovered applications
- Filter by status (found, cv_generated, reviewed, ready, applied, rejected)
- Search by job title or company name
- View generated CVs in a modal
- Open application links (auto-tracks clicks)
- Update status via inline dropdown

### Scheduler
- Preset frequencies: Every 6 Hours, Every 12 Hours, Daily, Weekly
- Custom cron expression support
- Enable/Disable toggle
- Persistent schedule (survives restarts)

### Agent Monitor
- Visual pipeline: Orchestrator -> Researcher -> CV Generator -> Reviewer
- Real-time status indicators per stage
- Scrollable activity log with agent badges and timestamps

### Settings
- Groq API key management (show/hide toggle)
- Adzuna credentials
- LinkedIn OAuth connection
- Job search criteria (keywords, location, filters)

---

## Project Structure

```
overEmployed/
├── package.json              # Dependencies and scripts
├── vite.config.js            # Vite + React Native Web config
├── index.html                # HTML entry point
├── .env / .env.example       # Environment variables
│
├── context/                  # Agent context MD files
│   ├── identity.md           # Professional identity (AI + automation focus)
│   ├── identity-branding.md  # Branding for job applications
│   ├── agent.md              # Agent instructions and workflow
│   ├── memory.md             # Stable facts and preferences
│   ├── tools.md              # Tooling reference
│   └── context.md            # Project context (J2 job search strategy)
│
├── src/                      # Frontend (React Native Web)
│   ├── main.jsx              # Entry point
│   ├── App.jsx               # Router + Layout
│   ├── theme.js              # Dark theme tokens
│   ├── components/
│   │   ├── Layout.jsx        # Sidebar navigation
│   │   ├── Dashboard.jsx     # Metrics + activity
│   │   ├── JobList.jsx       # Applications table
│   │   ├── CVViewer.jsx      # CV modal viewer
│   │   ├── Scheduler.jsx     # Cron scheduling UI
│   │   ├── AgentMonitor.jsx  # Pipeline status + log
│   │   ├── MetricCard.jsx    # Reusable metric display
│   │   └── Settings.jsx      # API keys + config
│   ├── hooks/
│   │   ├── useApi.js         # API call hook
│   │   └── useWebSocket.js   # WebSocket connection hook
│   └── utils/
│       └── formatters.js     # Date, status, source formatters
│
├── server/                   # Backend (Express.js)
│   ├── index.js              # Server entry + WebSocket
│   ├── routes/
│   │   ├── agents.js         # POST /api/agents/run, GET /status, /history
│   │   ├── jobs.js           # CRUD for applications + GET /api/metrics
│   │   ├── schedule.js       # GET/POST/DELETE /api/schedule
│   │   └── auth.js           # LinkedIn OAuth flow
│   ├── agents/
│   │   ├── BaseAgent.js      # LLM calls, dispatch, memory, logging
│   │   ├── OrchestratorAgent.js  # Pipeline coordinator
│   │   ├── ResearcherAgent.js    # Job scraping + scoring
│   │   ├── CVGeneratorAgent.js   # CV tailoring
│   │   └── ReviewerAgent.js      # Quality validation + storage
│   ├── services/
│   │   ├── groq.js           # Groq LLM (OpenAI-compatible)
│   │   ├── dynamodb.js       # DynamoDB CRUD
│   │   ├── memory.js         # JSON file persistence
│   │   ├── scheduler.js      # node-cron manager
│   │   └── scrapers/
│   │       ├── remoteok.js   # RemoteOK free API
│   │       ├── remotive.js   # Remotive free API
│   │       ├── adzuna.js     # Adzuna API (free tier)
│   │       └── linkedin.js   # LinkedIn headless scraper
│   └── middleware/
│       └── errorHandler.js   # Global error handler
│
├── scripts/
│   └── setup-aws.js          # DynamoDB table creation
│
└── data/                     # Runtime data (gitignored)
    ├── memory.json           # Agent memory persistence
    └── schedule.json         # Scheduler config
```

---

## API Endpoints

### Agents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agents/run` | Trigger a full pipeline run (optional `API_KEY` / `Authorization: Bearer`) |
| GET | `/api/agents/status` | Check if agents are running |
| GET | `/api/agents/history` | Get past run history |
| POST | `/api/jobs/:id/apply` | Start browser apply for an application (optional `API_KEY`) |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List all applications |
| GET | `/api/jobs/:id` | Get single application |
| GET | `/api/jobs/status/:status` | Filter by status |
| PATCH | `/api/jobs/:id/status` | Update application status |
| DELETE | `/api/jobs/:id` | Delete an application |
| GET | `/api/metrics` | Aggregated dashboard metrics |

### Schedule
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedule` | Get current schedule |
| POST | `/api/schedule` | Set schedule `{cron, enabled}` |
| DELETE | `/api/schedule` | Stop and clear schedule |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/linkedin` | Start LinkedIn OAuth flow |
| GET | `/api/auth/linkedin/callback` | OAuth callback handler |
| GET | `/api/auth/linkedin/status` | Check LinkedIn connection |
| DELETE | `/api/auth/linkedin` | Disconnect LinkedIn |
| POST | `/api/auth/linkedin/cookie` | Save `li_at` cookie (body: `{ cookie }`) |

See [docs/API.md](docs/API.md) for profile, HITL, and schedule routes.

---

## Job Sources

| Source | Type | Auth Required | Cost |
|--------|------|---------------|------|
| RemoteOK | Free JSON API | No | Free |
| Remotive | Free JSON API | API key (free) | Free |
| Adzuna | REST API | App ID + Key (free tier) | Free |
| LinkedIn | Headless scraper | Optional (li_at cookie) | Free |

---

## DynamoDB Schema

**Table**: `TheHolyGrail-Applications`

| Field | Type | Description |
|-------|------|-------------|
| applicationId | String (PK) | UUID |
| roleTitle | String | Job title |
| company | String | Company name |
| jobLink | String | Application URL |
| source | String | Job board source |
| tailoredCV | String | Generated CV content |
| status | String | found / cv_generated / reviewed / ready / applied / rejected |
| matchScore | Number | LLM-assigned relevance score (0-100) |
| dateFound | String | ISO timestamp |
| runId | String | Pipeline run that found it |
| tags | List | Job tags/keywords |
| ttl | Number | Unix timestamp for auto-deletion (90 days) |

---

## LLM Configuration

Uses Groq's OpenAI-compatible API with the `openai/gpt-oss-120b` model:

- **Context window**: 131,072 tokens
- **Max output**: 65,536 tokens
- **Speed**: ~500 tokens/second
- **Cost**: $0.15/M input tokens, $0.60/M output tokens
- **Capabilities**: Tool use, reasoning, JSON mode

The model is used for:
1. **Job scoring** -- evaluating remote-friendliness, J2-compatibility, skill match
2. **CV generation** -- tailoring content to match job requirements
3. **CV review** -- validating quality, completeness, ATS-friendliness

---

## Context Files

The agent system is driven by 6 markdown files in `context/`:

- **identity.md** -- Professional identity (AI Engineering + Automation)
- **identity-branding.md** -- Branding for job applications
- **agent.md** -- Agent instructions and messaging framework
- **memory.md** -- Stable facts, experience, preferences
- **tools.md** -- Tooling reference and decision trees
- **context.md** -- Project context, target roles, success criteria

These files define the user's professional profile, target roles, J2 suitability filters, and quality standards that all agents reference during execution.

---

## Troubleshooting

**"Cannot find module" errors**
- Ensure all dependencies installed: `npm install`

**DynamoDB access denied**
- Verify AWS CLI profile: `aws sts get-caller-identity --profile TheHolyGrail`
- Run setup: `npm run setup-aws`

**LinkedIn scraper fails**
- The headless browser requires Chromium. On first run it may need to download.
- LinkedIn actively blocks scrapers. Anonymous scraping has limited reliability.
- For better results, connect LinkedIn OAuth in Settings.

**Groq API errors**
- Verify your API key in `.env`
- Check rate limits at https://console.groq.com/docs/rate-limits

**WebSocket not connecting**
- Ensure the backend is running (default port **4900**)
- In production, set `VITE_API_URL` / `VITE_WS_URL` so the SPA connects to the API host, not Vercel
- HTTPS sites require **wss://**; put TLS in front of the API (see [docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md))

**CORS errors from Vercel**
- Set `FRONTEND_URL` or `FRONTEND_URLS` on the API to your exact Vercel URL(s)
