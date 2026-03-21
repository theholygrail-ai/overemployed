import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export function shouldUseWorkerLambda() {
  return Boolean(process.env.ORCHESTRATOR_FUNCTION_NAME || process.env.WORKER_FUNCTION_NAME);
}

function functionName() {
  return process.env.ORCHESTRATOR_FUNCTION_NAME || process.env.WORKER_FUNCTION_NAME;
}

function region() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1';
}

let _client;

function client() {
  if (!_client) _client = new LambdaClient({ region: region() });
  return _client;
}

async function parsePayload(response) {
  const raw = response.Payload;
  if (raw == null) return null;
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const text = buf.toString('utf8');
  if (!text) return null;
  return JSON.parse(text);
}

/**
 * Fire-and-forget orchestrator run (matches API returning before run completes).
 */
export async function invokeOrchestratorAsync(payload) {
  const name = functionName();
  if (!name) throw new Error('ORCHESTRATOR_FUNCTION_NAME not set');

  await client().send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );
}

/**
 * Synchronous invoke — waits for worker response (e.g. apply).
 */
export async function invokeWorkerSync(payload) {
  const name = functionName();
  if (!name) throw new Error('ORCHESTRATOR_FUNCTION_NAME not set');

  const response = await client().send(
    new InvokeCommand({
      FunctionName: name,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    })
  );

  if (response.FunctionError) {
    const errPayload = await parsePayload(response);
    const msg = errPayload?.errorMessage || errPayload?.message || response.FunctionError;
    throw new Error(msg || 'Worker Lambda returned an error');
  }

  return parsePayload(response);
}
