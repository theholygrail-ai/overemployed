import path from 'path';

/**
 * Writable data directory. Lambda filesystem is read-only except /tmp.
 */
export function dataRoot() {
  if (process.env.DATA_ROOT) return process.env.DATA_ROOT;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
    return '/tmp/data';
  }
  return path.join(process.cwd(), 'data');
}
