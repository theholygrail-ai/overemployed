# AWS serverless deployment (SAM + Lambda)

This stack deploys the Express API as **two container-based Lambda functions**:

1. **HttpApiFunction** — REST API via **Lambda Function URL** (15-minute timeout; no API Gateway 30s limit).
2. **OrchestratorFunction** — runs the job pipeline (`POST /api/agents/run`) and apply (`POST /api/jobs/:id/apply`) when invoked by the HTTP function.

State that must survive cold starts (memory, schedule, run status) is stored in **S3** (`DATA_S3_BUCKET`). DynamoDB credentials use the Lambda execution role (no `~/.aws` profile).

## Prerequisites

- AWS CLI v2 and Docker (SAM uses Docker to build the container image).
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed.
- DynamoDB table `TheHolyGrail-Applications` already created: `npm run setup-aws` (or your profile/region).

## 1. Build

```powershell
cd f:\overEmployed
sam build --template-file sam/template.yaml
```

## 2. Deploy

First deploy (interactive):

```powershell
sam deploy --template-file sam/template.yaml --guided
```

Use stack name e.g. `overemployed-serverless`, region `eu-north-1`, capabilities **CAPABILITY_IAM**.

Set parameters:

| Parameter | Description |
|-----------|-------------|
| `GroqApiKey` | Optional Groq features (e.g. session-cookie extract); not used for apply |
| `NovaActWorkflowDefinitionName` | Registered Nova Act workflow in **us-east-1** (required for apply on Lambda/EC2) |
| `NovaActModelId` | Passed to `CreateWorkflowRun` (default `nova-act-latest`) |
| `NovaActApiKey` | Optional Playground key; IAM apply does not require it |
| `AdzunaAppId` / `AdzunaAppKey` | Optional job source |
| `FrontendOrigins` | Your Vercel URL(s), comma-separated, for CORS |
| `ApiKey` | Optional; if set, must match `VITE_API_KEY` on Vercel |
| `DynamoTableName` | Default `TheHolyGrail-Applications` |

Subsequent deploys:

```powershell
npm run deploy:aws
```

Or:

```powershell
sam deploy --template-file sam/template.yaml --no-confirm-changeset --capabilities CAPABILITY_IAM --resolve-s3 `
  --parameter-overrides GroqApiKey=gsk_xxx FrontendOrigins=https://your-app.vercel.app
```

## 3. Outputs

After deploy, note **HttpApiUrl** from CloudFormation outputs (or, if you use **API Gateway HTTP API** instead of a Lambda Function URL, use the `ApiEndpoint` from `aws apigatewayv2 get-apis`). Use it as:

- `VITE_API_URL` = that URL **without** trailing slash (same value as origin; paths are `/api/...`). Example shape: `https://xxxx.execute-api.eu-north-1.amazonaws.com`.

### Session cookie AI extract (Settings UI)

`POST /api/settings/session-cookies/extract` uses **Groq** (`openai/gpt-oss-120b` by default) with `GROQ_API_KEY` from Lambda env. Override model with env `GROQ_SESSION_EXTRACT_MODEL` if needed.

## 4. Vercel

In the Vercel project settings → Environment Variables (Production):

```
VITE_API_URL=https://xxxx.lambda-url.REGION.on.aws
VITE_DISABLE_WS=true
VITE_API_KEY=<same as ApiKey parameter if you set one>
```

- `VITE_WS_URL` — leave unset or set `VITE_DISABLE_WS=true` (WebSockets are not exposed on Lambda Function URL; the UI falls back to polling).

Redeploy the frontend. The deployment URL is shown in the Vercel dashboard (e.g. `https://overemployed.vercel.app`).

## Architecture notes

- **Long runs**: `POST /api/agents/run` returns immediately and invokes the **Orchestrator** Lambda asynchronously. Poll `GET /api/agents/status`.
- **Apply**: Uses synchronous Lambda invoke (still within 15 minutes). Nova Act IAM apply runs **Playwright in-process**; the default Lambda image does **not** enable this — apply returns a clear error unless you run the API on **EC2/Docker** or build a Chromium-capable Lambda image and set `NOVA_ACT_ALLOW_LAMBDA_PLAYWRIGHT=true`.
- **Cron**: `node-cron` is disabled in Lambda (`ENABLE_NODE_CRON=false`). Use **EventBridge** to invoke `OrchestratorFunction` on a schedule if needed (add target in console or extend the template).
- **HITL / screenshots**: Stored under `/tmp` in the Lambda instance; not durable across cold starts. For production HITL persistence, extend storage to S3/DynamoDB.

## Troubleshooting

- **403/401 on API**: Set `ApiKey` in SAM and `VITE_API_KEY` on Vercel, or leave both empty for open endpoints (not recommended in production).
- **CORS**: Adjust `FrontendOrigins` to match your exact Vercel domain(s).
- **DynamoDB access denied**: Ensure the table name matches `DynamoTableName` and the Lambda role has `dynamodb:*` on that table (SAM policy `DynamoDBCrudPolicy`).
