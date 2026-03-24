import { describe, it, expect, vi, afterEach } from 'vitest';
import { truncate, sourceIcon, formatDate, timeAgo, statusColor } from './formatters.js';

const theme = {
  colors: {
    warning: '#w',
    primary: '#p',
    primaryHover: '#ph',
    success: '#s',
    error: '#e',
    textMuted: '#m',
  },
};

describe('formatters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('truncate handles empty and length', () => {
    expect(truncate('', 5)).toBe('');
    expect(truncate('hello world', 5)).toBe('hello…');
    expect(truncate('short', 10)).toBe('short');
  });

  it('sourceIcon maps known sources', () => {
    expect(sourceIcon('linkedin')).toBe('🔗');
    expect(sourceIcon('UNKNOWN')).toBe('📋');
  });

  it('formatDate returns dash for falsy', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('2024-06-15T12:00:00.000Z')).toMatch(/Jun/);
  });

  it('timeAgo uses relative buckets', () => {
    const now = new Date('2025-01-15T12:00:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(timeAgo(new Date(now - 30_000).toISOString())).toBe('just now');
    expect(timeAgo(new Date(now - 120_000).toISOString())).toBe('2 min ago');
  });

  it('statusColor falls back to textMuted', () => {
    expect(statusColor('ready', theme)).toBe('#s');
    expect(statusColor('unknown_status', theme)).toBe('#m');
  });
});
