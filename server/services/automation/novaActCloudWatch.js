import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

const NOVA_REGION = 'us-east-1';

/**
 * @param {string} logGroupName
 * @param {number} startTimeMs
 * @param {(line: string) => void} onLine
 */
export async function tailNovaActLogGroup(logGroupName, startTimeMs, onLine) {
  if (!logGroupName || !onLine) return;
  const client = new CloudWatchLogsClient({ region: NOVA_REGION });
  let nextToken;
  try {
    const out = await client.send(
      new FilterLogEventsCommand({
        logGroupName,
        startTime: startTimeMs,
        limit: 50,
        nextToken,
      }),
    );
    const events = out.events || [];
    for (const ev of events) {
      if (ev.message) onLine(ev.message.trim());
    }
  } catch (e) {
    onLine(`[CloudWatch] ${e?.message || e}`);
  }
}
