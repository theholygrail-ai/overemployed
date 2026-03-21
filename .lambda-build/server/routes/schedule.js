import { Router } from 'express';
import { getSchedule, setSchedule, stopScheduler } from '../services/scheduler.js';
import OrchestratorAgent from '../agents/OrchestratorAgent.js';

export function createScheduleRoutes(broadcast) {
  const router = Router();

  router.get('/api/schedule', async (req, res, next) => {
    try {
      const schedule = await getSchedule();
      res.json(schedule);
    } catch (err) {
      next(err);
    }
  });

  router.post('/api/schedule', async (req, res, next) => {
    try {
      const cronExpression = req.body.cron || req.body.cronExpression;
      const enabled = req.body.enabled !== false;
      if (!cronExpression) {
        return res.status(400).json({ error: 'cron expression is required' });
      }

      await setSchedule(cronExpression, enabled);

      broadcast({ type: 'schedule:updated', cron: cronExpression, enabled });
      const schedule = await getSchedule();
      res.json(schedule);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/api/schedule', async (req, res, next) => {
    try {
      stopScheduler();
      await setSchedule(null, false);
      broadcast({ type: 'schedule:cleared' });
      res.json({ cleared: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
