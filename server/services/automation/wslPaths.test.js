import { describe, it, expect } from 'vitest';
import { toWslPath, REPO_ROOT } from './wslPaths.js';
import path from 'path';

describe('toWslPath', () => {
  it('converts Windows drive paths', () => {
    expect(toWslPath('F:\\overEmployed\\scripts\\x.py')).toBe('/mnt/f/overEmployed/scripts/x.py');
    expect(toWslPath('C:/Users/test/file.txt')).toBe('/mnt/c/Users/test/file.txt');
  });

  it('leaves non-drive paths unchanged', () => {
    expect(toWslPath('/mnt/f/foo')).toBe('/mnt/f/foo');
    expect(toWslPath('relative')).toBe('relative');
  });
});

describe('REPO_ROOT', () => {
  it('points at project root (parent of server/)', () => {
    expect(path.basename(REPO_ROOT)).not.toBe('server');
    expect(path.join(REPO_ROOT, 'server', 'app.js')).toMatch(/app\.js$/);
  });
});
