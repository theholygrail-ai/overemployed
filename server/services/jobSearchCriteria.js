import { getMemoryKey, setMemoryKey } from './memory.js';
import {
  DEFAULT_CRITERIA,
  DEFAULT_JOB_FILTERS,
  DEFAULT_JOB_KEYWORDS,
  DEFAULT_JOB_LOCATION,
} from '../config/defaultJobCriteria.js';

const STORAGE_KEY = 'jobSearchCriteria';

/**
 * Comma/semicolon-separated keywords → non-empty trimmed strings.
 */
export function normalizeKeywordList(input) {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Loose key=value lines (filters field in Settings).
 */
export function parseFiltersText(text) {
  if (text == null || typeof text !== 'string') return {};
  const out = {};
  for (const part of text.split(/[,;\n]/)) {
    const seg = part.trim();
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq <= 0) continue;
    const k = seg.slice(0, eq).trim();
    let v = seg.slice(eq + 1).trim();
    if (v === 'true') out[k] = true;
    else if (v === 'false') out[k] = false;
    else if (/^\d+$/.test(v)) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

/**
 * Criteria merged for a pipeline run: defaults < S3/memory storage < request override.
 */
export async function resolveRunCriteria(override = {}) {
  const stored = (await getMemoryKey(STORAGE_KEY)) || {};

  const storedKw = normalizeKeywordList(stored.keywords ?? stored.keywordsText);
  let keywords =
    storedKw.length > 0 ? storedKw : [...DEFAULT_JOB_KEYWORDS];

  const location =
    (stored.location && String(stored.location).trim()) || DEFAULT_JOB_LOCATION;

  const storedFilterObj =
    typeof stored.filters === 'object' && stored.filters !== null && !Array.isArray(stored.filters)
      ? stored.filters
      : {};

  const filters = {
    ...DEFAULT_JOB_FILTERS,
    ...storedFilterObj,
    ...parseFiltersText(typeof stored.filtersText === 'string' ? stored.filtersText : ''),
  };

  let criteria = { keywords, location, filters };

  if (override && typeof override === 'object') {
    if (override.keywords != null) {
      const o = normalizeKeywordList(override.keywords);
      if (o.length > 0) criteria.keywords = o;
      else criteria.keywords = [...DEFAULT_JOB_KEYWORDS];
    }
    if (override.location != null && String(override.location).trim()) {
      criteria.location = String(override.location).trim();
    }
    if (override.filters != null && typeof override.filters === 'object') {
      criteria.filters = { ...criteria.filters, ...override.filters };
    }
  }

  return criteria;
}

/**
 * Persist UI fields (Settings). Empty keywords → use server defaults on next run.
 */
export async function saveJobSearchCriteria(body = {}) {
  const keywordsText =
    typeof body.keywords === 'string'
      ? body.keywords
      : Array.isArray(body.keywords)
        ? body.keywords.join(', ')
        : '';

  const location =
    body.location != null && String(body.location).trim()
      ? String(body.location).trim()
      : '';

  const filtersText = typeof body.filters === 'string' ? body.filters : '';

  const record = {
    keywordsText,
    location,
    filtersText,
    updatedAt: new Date().toISOString(),
  };

  await setMemoryKey(STORAGE_KEY, record);
  return record;
}

export async function getJobSearchCriteriaForApi() {
  const stored = (await getMemoryKey(STORAGE_KEY)) || {};
  return {
    keywords: stored.keywordsText ?? '',
    location: stored.location ?? '',
    filters: stored.filtersText ?? '',
    updatedAt: stored.updatedAt ?? null,
  };
}

export { DEFAULT_CRITERIA, STORAGE_KEY };
