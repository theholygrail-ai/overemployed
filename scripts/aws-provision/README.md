# AWS EC2 provisioning (Overemployed API + Docker)

This folder contains IAM policies, user-data, and helper JSON used to run the API on **EC2** with **Docker Compose**. Apply automation uses **AWS Nova Act** (IAM, **us-east-1**) plus Playwright inside the `api` image.

## What was created (account `974560757141`, region `eu-north-1`)

| Resource | Name / ID |
|----------|-----------|
| S3 bucket | `overemployed-code-974560757141` (deploy zip + patches) |
| Secrets Manager | `overemployed/ec2-env` — **JSON → `.env` at boot** (edit keys in console) |
| IAM role | `OveremployedEC2Role` + instance profile `OveremployedEC2Profile` |
| Security group | `overemployed-api-sg` (`sg-0e326daf068db8bcf`) — SSH from provisioner IP, `4900` public |
| EC2 instance | `i-04d5210ffc3132ada` — **Name** `overemployed-api`, **public IP** (allocate Elastic IP if you need a stable URL) |

## Sync secrets from your laptop (recommended)

From the repo root (with a filled **`.env`**):

```bash
npm run sync:ec2-secrets
```

Then apply on the instance (SSM or SSH):

```bash
# See ssm-refresh-env.json — or use AWS Console → Systems Manager → Run command
```

## Required next steps (you)

1. **Secrets Manager** → `overemployed/ec2-env` — use **`npm run sync:ec2-secrets`** from a machine that has your `.env`, or edit keys manually (**`NOVA_ACT_WORKFLOW_DEFINITION_NAME`**, **`DATA_S3_BUCKET`**, **`GROQ_API_KEY`** for optional Groq features, **`FRONTEND_URL`** / **`API_KEY`**).
2. On the instance, refresh `.env` and restart (or reboot):

   ```bash
   # SSM Session Manager or SSH
   cd /opt/overemployed
   aws secretsmanager get-secret-value --region eu-north-1 --secret-id overemployed/ec2-env --query SecretString --output text > /tmp/oe.json
   jq -r 'to_entries[] | "\(.key)=\(.value)"' /tmp/oe.json > .env
   docker compose up -d --build api
   ```

3. **HTTPS**: put **nginx/Caddy** in front or **Cloudflare** — browsers need `https` → `https` for the API from Vercel.

4. **Vercel env**: `VITE_API_URL=http://YOUR_IP_OR_DNS:4900` (or `https://…` after TLS), `VITE_WS_URL` if using WebSockets.

## Re-deploy app code (recommended: laptop → S3 → SSM)

The EC2 app dir often has **no `.git`**, so `git pull` on the instance does nothing. Use a **git archive** from your machine, upload to S3, then SSM extracts and rebuilds Docker.

From repo root (AWS CLI + credentials for account `974560757141`):

```bash
npm run deploy:ec2-api
```

This runs `scripts/deploy-ec2-api.mjs`: archives `HEAD`, uploads to `s3://overemployed-code-974560757141/releases/oe-main-latest.tar.gz`, and starts **SSM RunShellScript** on instance `i-04d5210ffc3132ada` using `ssm-deploy-s3-tarball.json` (refresh Secrets Manager `.env`, `docker compose build/up api`, curl smoke tests).

Poll the command:

```bash
aws ssm get-command-invocation --region eu-north-1 --command-id <CommandId> --instance-id i-04d5210ffc3132ada --query Status
```

### Manual S3 + SSM (same as script)

```bash
git archive --format=tar.gz -o /tmp/oe-main.tar.gz HEAD
aws s3 cp /tmp/oe-main.tar.gz s3://overemployed-code-974560757141/releases/oe-main-latest.tar.gz --region eu-north-1
# Then run Command in Console using scripts/aws-provision/ssm-deploy-s3-tarball.json parameters, or send-command with that JSON.
```

## Smoke test

```bash
curl -s "http://PUBLIC_IP:4900/api/metrics"
curl -s "http://PUBLIC_IP:4900/api/jobs/00000000-0000-0000-0000-000000000001/nova-act/trace"
# Expect JSON: {"applicationId":"...","lines":[]} — not HTML "Cannot GET".
```
