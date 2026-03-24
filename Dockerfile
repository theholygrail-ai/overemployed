# API server for AWS EC2 / Docker Compose (not Vercel)
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
    python3 \
    python3-pip \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# Nova Act runtime for apply (Python SDK + browser install per official docs)
RUN python3 -m pip install --no-cache-dir --upgrade pip \
  && python3 -m pip install --no-cache-dir "nova-act>=3.0" \
  && python3 -c "import nova_act; print('nova_act_ok')"
RUN python3 -m playwright install chromium --with-deps || python3 -m playwright install chromium || true

COPY server ./server
COPY context ./context
COPY scripts ./scripts

RUN mkdir -p data/artifacts data/cvs

ENV NODE_ENV=production
ENV PORT=4900

EXPOSE 4900

CMD ["node", "server/index.js"]
