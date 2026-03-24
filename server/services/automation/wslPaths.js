import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root: .../server/services/automation -> ../../../ */
export const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * @param {string} winPath
 * @returns {string}
 */
export function toWslPath(winPath) {
  if (!winPath || typeof winPath !== 'string') return winPath;
  const normalized = winPath.replace(/\\/g, '/');
  const match = normalized.match(/^([A-Za-z]):\/(.*)/);
  if (!match) return winPath;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}
