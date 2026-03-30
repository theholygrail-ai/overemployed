import express from 'express';
import cors from 'cors';
import { createAgentRoutes } from './routes/agents.js';
import jobRoutes from './routes/jobs.js';
import { createScheduleRoutes } from './routes/schedule.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import hitlRoutes from './routes/hitl.js';
import sessionCookiesRoutes from './routes/sessionCookies.js';
import sessionCaptureRoutes from './routes/sessionCapture.js';
import applyCredentialsRoutes from './routes/applyCredentials.js';
import jobCriteriaRoutes from './routes/jobCriteria.js';
import automationRoutes from './routes/automation.js';
import errorHandler from './middleware/errorHandler.js';
import { mutationRateLimitMiddleware } from './middleware/mutationRateLimit.js';

/**
 * @param {{ broadcast: (event: object) => void }} options
 */
export function createApp({ broadcast }) {
  const app = express();

  const corsOriginsRaw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5200';
  const corsOrigins = corsOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const corsOption =
    corsOrigins.length <= 1
      ? { origin: corsOrigins[0] || 'http://localhost:5200', credentials: true }
      : { origin: corsOrigins, credentials: true };

  app.use(cors(corsOption));
  app.use(express.json({ limit: '10mb' }));
  app.use(mutationRateLimitMiddleware());

  app.use(createAgentRoutes(broadcast));
  app.use(jobRoutes);
  app.use(createScheduleRoutes(broadcast));
  app.use(authRoutes);
  app.use(profileRoutes);
  app.use(hitlRoutes);
  app.use(sessionCookiesRoutes);
  app.use(sessionCaptureRoutes);
  app.use(applyCredentialsRoutes);
  app.use(jobCriteriaRoutes);
  app.use(automationRoutes);

  app.use(errorHandler);

  return app;
}
