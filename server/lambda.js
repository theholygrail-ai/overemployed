/**
 * AWS Lambda Function URL handler — HTTP API (Express via serverless-express).
 * Set ORCHESTRATOR_FUNCTION_NAME so POST /api/agents/run invokes the worker Lambda.
 */
import dotenv from 'dotenv';
dotenv.config();

import serverlessExpress from '@codegenie/serverless-express';
import { createApp } from './app.js';
import { appendRunActivity } from './services/runState.js';

const app = createApp({
  broadcast: (event) => {
    appendRunActivity(event).catch(() => {});
  },
});

export const handler = serverlessExpress({ app });
