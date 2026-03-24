# API server for AWS EC2 / Docker Compose (not Vercel). Apply uses Node + Playwright + Nova Act control plane (us-east-1 IAM).
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

RUN npx playwright install chromium --with-deps || npx playwright install chromium || true

COPY server ./server
COPY context ./context
COPY scripts ./scripts

RUN mkdir -p data/artifacts data/cvs

ENV NODE_ENV=production
ENV PORT=4900

EXPOSE 4900

CMD ["node", "server/index.js"]
