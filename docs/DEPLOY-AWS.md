# Deploy API on AWS (EC2 + Docker) — low cost

The Express API **cannot** run on Vercel serverless (long jobs, WebSockets, Playwright, cron). Use a small **EC2** instance with **Docker Compose**.

## 1. Launch EC2

- **AMI**: Amazon Linux 2023 or Ubuntu 22.04  
- **Instance type**: `t3.micro` (free tier eligible for new accounts, 750 hrs/month for 12 months)  
- **Storage**: 20–30 GB gp3  
- **Security group** inbound:
  - **22** — SSH (restrict to **your IP** only)
  - **4900** — TCP for HTTP API (temporary; replace with **443** after TLS)

Optional: allocate an **Elastic IP** and associate it so `VITE_API_URL` stays stable.

## 2. Install Docker

**Amazon Linux 2023:**

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# log out and back in
```

**Ubuntu:**

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

## 3. Clone repo and configure

```bash
git clone https://github.com/YOUR_USER/overemployed.git
cd overemployed
```

Create `.env` on the instance (do not commit). Minimum:

- `GROQ_API_KEY`
- `AWS_REGION`
- Credentials: instance **IAM role** (recommended) or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` with DynamoDB access
- `FRONTEND_URL` or `FRONTEND_URLS` — your **Vercel** URL(s), comma-separated
- `PORT=4900`
- `API_KEY` — random secret; use the same value in Vercel as `VITE_API_KEY`
- `LINKEDIN_REDIRECT_URI` — must be `https://YOUR_API_HOST/api/auth/linkedin/callback`

Run table setup once (from laptop or EC2 with AWS CLI):

```bash
npm run setup-aws
```

## 4. Build and run

```bash
docker compose up -d --build
docker compose logs -f
```

`./data` on the host is mounted to `/app/data` so `memory.json`, `schedule.json`, and uploads survive restarts.

## 5. Smoke test

```bash
curl -s "http://YOUR_PUBLIC_IP:4900/api/metrics" | head
```

## 6. HTTPS (required if Vercel is HTTPS)

Browsers block mixed content (HTTPS page calling HTTP API). Use one of:

- **Caddy** or **nginx** on the instance with **Let’s Encrypt** (port 443 → proxy to `127.0.0.1:4900`)
- Or **Cloudflare** in front of the EC2 IP with “Full” SSL

Then set:

- Vercel env: `VITE_API_URL=https://api.yourdomain.com` (no trailing slash)  
- Optional: `VITE_WS_URL=wss://api.yourdomain.com/ws`

## 7. WebSocket through a reverse proxy

Ensure your proxy passes **Upgrade** and **Connection** headers for `/ws`. Example nginx:

```nginx
location /ws {
  proxy_pass http://127.0.0.1:4900;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## 8. IAM role (recommended)

Attach a role to the instance with `dynamodb:GetItem`, `PutItem`, `Query`, `Scan`, `UpdateItem`, `DeleteItem` on `TheHolyGrail-Applications` (and any GSIs). No long-lived keys on disk.
