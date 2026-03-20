import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';

const SCHEDULE_PATH = path.join(process.cwd(), 'data', 'schedule.json');

let currentJob = null;
let currentTaskFn = null;
let currentCronExpression = null;
let running = false;
let lastRun = null;

async function ensureDir() {
  await fs.mkdir(path.dirname(SCHEDULE_PATH), { recursive: true });
}

async function loadScheduleConfig() {
  try {
    const raw = await fs.readFile(SCHEDULE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { enabled: false, cronExpression: null, lastRun: null, nextRun: null };
  }
}

async function saveScheduleConfig(config) {
  await ensureDir();
  await fs.writeFile(SCHEDULE_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function getSchedule() {
  const config = await loadScheduleConfig();
  return {
    enabled: config.enabled,
    cron: config.cronExpression,
    cronExpression: config.cronExpression,
    lastRun: lastRun || config.lastRun,
    nextRun: config.nextRun,
  };
}

export async function setSchedule(cronExpression, enabled) {
  const config = await loadScheduleConfig();
  config.cronExpression = cronExpression;
  config.enabled = enabled;
  await saveScheduleConfig(config);

  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  if (enabled && currentTaskFn && cron.validate(cronExpression)) {
    scheduleJob(cronExpression, currentTaskFn);
  }
}

function scheduleJob(cronExpression, taskFn) {
  currentCronExpression = cronExpression;
  currentJob = cron.schedule(cronExpression, async () => {
    if (running) return;
    running = true;
    try {
      await taskFn();
    } finally {
      running = false;
      lastRun = new Date().toISOString();
      saveScheduleConfig({
        enabled: true,
        cronExpression,
        lastRun,
        nextRun: null,
      }).catch(() => {});
    }
  });
}

export async function startScheduler(taskFn) {
  currentTaskFn = taskFn;
  const config = await loadScheduleConfig();

  if (config.enabled && config.cronExpression && cron.validate(config.cronExpression)) {
    scheduleJob(config.cronExpression, taskFn);
  }
}

export function stopScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }
}

export function getStatus() {
  return {
    enabled: currentJob !== null,
    running,
    cronExpression: currentCronExpression,
    lastRun,
  };
}
