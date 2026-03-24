/** Single source for pipeline defaults (orchestrator + researcher + stored criteria). */
export const DEFAULT_JOB_KEYWORDS = [
  'AI Engineer',
  'Automation Engineer',
  'Software Developer',
  'Systems Analyst',
  'Solutions Engineer',
  'Technical Writer',
];

export const DEFAULT_JOB_LOCATION = 'remote';

export const DEFAULT_JOB_FILTERS = {
  remoteOnly: true,
  j2Compatible: true,
};

export const DEFAULT_CRITERIA = {
  keywords: DEFAULT_JOB_KEYWORDS,
  location: DEFAULT_JOB_LOCATION,
  filters: { ...DEFAULT_JOB_FILTERS },
};
