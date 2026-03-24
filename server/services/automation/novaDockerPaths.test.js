import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { REPO_ROOT } from './wslPaths.js';
import { resolveNovaRunnerPaths, getDockerHostDataPathForNova } from './novaDockerPaths.js';

const orig = { ...process.env };

beforeEach(() => {
  process.env = { ...orig };
});

afterEach(() => {
  process.env = orig;
});

describe('resolveNovaRunnerPaths', () => {
  it('uses WSL paths when Docker is off', () => {
    delete process.env.NOVA_ACT_USE_DOCKER;
    const dr = path.join(REPO_ROOT, 'data');
    const r = resolveNovaRunnerPaths(
      { docxPath: path.join(dr, 'cvs', 'a.docx'), pdfPath: path.join(dr, 'cvs', 'a.pdf') },
      [],
    );
    expect(r.useDocker).toBe(false);
    expect(r.scriptPath).toMatch(/nova_act_agent\.py$/);
    expect(r.pdfPath).toMatch(/cvs[/\\]a\.pdf$/);
    expect(r.docxPath).toMatch(/cvs[/\\]a\.docx$/);
  });

  it('maps data files to /app/data in Docker mode', () => {
    process.env.NOVA_ACT_USE_DOCKER = 'true';
    const dr = path.join(REPO_ROOT, 'data');
    const r = resolveNovaRunnerPaths(
      { docxPath: path.join(dr, 'cvs', 'a.docx'), pdfPath: path.join(dr, 'cvs', 'a.pdf') },
      [],
    );
    expect(r.useDocker).toBe(true);
    expect(r.pdfPath).toBe('/app/data/cvs/a.pdf');
    expect(r.docxPath).toBe('/app/data/cvs/a.docx');
    expect(r.scriptInImage).toBe('/app/scripts/nova_act_agent.py');
  });
});

describe('getDockerHostDataPathForNova', () => {
  it('prefers NOVA_ACT_HOST_DATA_PATH', () => {
    process.env.NOVA_ACT_HOST_DATA_PATH = '/srv/oe/data';
    process.env.DATA_ROOT = '';
    const p = getDockerHostDataPathForNova();
    expect(p).toBe(path.resolve('/srv/oe/data'));
  });
});
