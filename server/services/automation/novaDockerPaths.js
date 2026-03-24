import path from 'path';
import { REPO_ROOT, toWslPath } from './wslPaths.js';
import { dataRoot } from '../../lib/dataPath.js';

/**
 * Host directory to bind-mount as /app/data inside the Nova container (docker run -v …:/app/data).
 * Required when the API runs inside Docker (dataRoot is /app/data). Optional when API runs on the host.
 */
export function getDockerHostDataPathForNova() {
  const explicit = process.env.NOVA_ACT_HOST_DATA_PATH;
  if (explicit && String(explicit).trim()) {
    return path.resolve(String(explicit).trim());
  }
  const dr = path.resolve(dataRoot());
  // Heuristic: API container layout from compose uses /app/data — host path unknown without explicit env
  if (dr === '/app/data' || dr.startsWith('/app/data/')) {
    return null;
  }
  return dr;
}

/**
 * Paths passed to nova_act_agent.py inside the target environment (WSL or Docker).
 * @param {{ docxPath: string, pdfPath: string }} cvAssets
 * @param {Array<{ path: string }>} artifacts
 */
export function resolveNovaRunnerPaths(cvAssets, artifacts) {
  const useDocker =
    process.env.NOVA_ACT_USE_DOCKER === 'true' ||
    process.env.NOVA_ACT_USE_DOCKER === '1' ||
    process.env.NOVA_ACT_USE_DOCKER === 'yes';

  const dr = path.resolve(dataRoot());
  const rr = path.resolve(REPO_ROOT);

  const toDockerAppData = (absPath) => {
    const r = path.resolve(absPath);
    if (r === dr || r.startsWith(dr + path.sep)) {
      const rel = path.relative(dr, r);
      return path.posix.join('/app/data', rel.split(path.sep).join(path.posix.sep));
    }
    if (r === rr || r.startsWith(rr + path.sep)) {
      const rel = path.relative(rr, r);
      return path.posix.join('/app', rel.split(path.sep).join(path.posix.sep));
    }
    return r.split(path.sep).join('/');
  };

  if (useDocker) {
    return {
      useDocker: true,
      scriptInImage: '/app/scripts/nova_act_agent.py',
      pdfPath: toDockerAppData(cvAssets.pdfPath),
      docxPath: toDockerAppData(cvAssets.docxPath),
      artifacts: artifacts.map((a) => ({
        ...a,
        path: toDockerAppData(a.path),
      })),
    };
  }

  return {
    useDocker: false,
    scriptPath: toWslPath(path.join(REPO_ROOT, 'scripts', 'nova_act_agent.py')),
    pdfPath: toWslPath(cvAssets.pdfPath),
    docxPath: toWslPath(cvAssets.docxPath),
    artifacts: artifacts.map((a) => ({
      ...a,
      path: toWslPath(a.path),
    })),
  };
}
