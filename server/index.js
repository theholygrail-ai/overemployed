import dotenv from 'dotenv';
dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  const msg = err?.message || '';
  if (msg.includes('EADDRINUSE')) {
    console.error(`[FATAL] Port ${process.env.PORT} already in use. Exiting.`);
    process.exit(1);
  }
  console.error('[UNCAUGHT EXCEPTION — RECOVERED]', msg);
});

import http from 'http';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { startScheduler } from './services/scheduler.js';
import OrchestratorAgent from './agents/OrchestratorAgent.js';
import { resolveRunCriteria } from './services/jobSearchCriteria.js';
import { appendRunActivity } from './services/runState.js';

const PORT = process.env.PORT || 4900;
const server = http.createServer();

server.timeout = 600_000;
server.keepAliveTimeout = 600_000;
server.headersTimeout = 610_000;

const wss = new WebSocketServer({ server });

function broadcast(event) {
  appendRunActivity(event).catch(() => {});
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(data);
      } catch {}
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
});

const app = createApp({ broadcast });
server.on('request', app);

startScheduler(async () => {
  try {
    const orchestrator = new OrchestratorAgent({ broadcast });
    const criteria = await resolveRunCriteria();
    await orchestrator.run(criteria);
  } catch (err) {
    console.error('[SCHEDULER RUN ERROR]', err.message);
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Frontend expected at ${process.env.FRONTEND_URL || 'http://localhost:5200'}`);
});
