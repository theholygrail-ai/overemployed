/** In-memory last LinkedIn scrape outcome for /api/auth/linkedin/status */

let state = {
  lastAttemptAt: null,
  lastJobCount: null,
  lastHadCookie: false,
  lastError: null,
};

export function recordLinkedInScrapeAttempt({ jobCount, hadCookie, error } = {}) {
  state = {
    lastAttemptAt: new Date().toISOString(),
    lastJobCount: typeof jobCount === 'number' ? jobCount : null,
    lastHadCookie: !!hadCookie,
    lastError: error || null,
  };
}

export function getLinkedInScrapeState() {
  return { ...state };
}
