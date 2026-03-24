import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeKeywordList,
  parseFiltersText,
  resolveRunCriteria,
} from './jobSearchCriteria.js';
import { DEFAULT_JOB_KEYWORDS } from '../config/defaultJobCriteria.js';

vi.mock('./memory.js', () => ({
  getMemoryKey: vi.fn(),
  setMemoryKey: vi.fn(),
}));

import { getMemoryKey } from './memory.js';

beforeEach(() => {
  vi.mocked(getMemoryKey).mockResolvedValue(null);
});

describe('normalizeKeywordList', () => {
  it('splits comma and semicolon lists', () => {
    expect(normalizeKeywordList('a, b;c')).toEqual(['a', 'b', 'c']);
  });

  it('trims arrays', () => {
    expect(normalizeKeywordList(['  x ', ''])).toEqual(['x']);
  });
});

describe('parseFiltersText', () => {
  it('parses booleans and numbers', () => {
    expect(parseFiltersText('remote=true, salary_min=100')).toEqual({
      remote: true,
      salary_min: 100,
    });
  });
});

describe('resolveRunCriteria', () => {
  it('uses defaults when storage empty', async () => {
    const c = await resolveRunCriteria();
    expect(c.keywords).toEqual(DEFAULT_JOB_KEYWORDS);
    expect(c.location).toBe('remote');
    expect(c.filters.remoteOnly).toBe(true);
  });

  it('merges stored keywords and override', async () => {
    vi.mocked(getMemoryKey).mockResolvedValue({
      keywordsText: 'Rust, Go',
      location: 'EU',
      filtersText: 'remoteOnly=false',
    });
    const c = await resolveRunCriteria({ keywords: ['Python'] });
    expect(c.keywords).toEqual(['Python']);
    expect(c.location).toBe('EU');
    expect(c.filters.remoteOnly).toBe(false);
  });
});
