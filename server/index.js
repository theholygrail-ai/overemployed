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

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

import { createAgentRoutes } from './routes/agents.js';
import jobRoutes from './routes/jobs.js';
import { createScheduleRoutes } from './routes/schedule.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import hitlRoutes from './routes/hitl.js';
import errorHandler from './middleware/errorHandler.js';
import { startScheduler } from './services/scheduler.js';
import OrchestratorAgent from './agents/OrchestratorAgent.js';

const PORT = process.env.PORT || 4900;
const app = express();
const server = http.createServer(app);

server.timeout = 600_000;
server.keepAliveTimeout = 600_000;
server.headersTimeout = 610_000;

const corsOriginsRaw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5200';
const corsOrigins = corsOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean);
const corsOption =
  corsOrigins.length <= 1
    ? { origin: corsOrigins[0] || 'http://localhost:5200', credentials: true }
    : { origin: corsOrigins, credentials: true };

app.use(cors(corsOption));
app.use(express.json({ limit: '10mb' }));

const wss = new WebSocketServer({ server });

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(data); } catch {}
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
});

app.use(createAgentRoutes(broadcast));
app.use(jobRoutes);
app.use(createScheduleRoutes(broadcast));
app.use(authRoutes);
app.use(profileRoutes);
app.use(hitlRoutes);

app.use(errorHandler);

startScheduler(async () => {
  try {
    const orchestrator = new OrchestratorAgent({ broadcast });
    await orchestrator.run();
  } catch (err) {
    console.error('[SCHEDULER RUN ERROR]', err.message);
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Frontend expected at ${process.env.FRONTEND_URL || 'http://localhost:5200'}`);
});
