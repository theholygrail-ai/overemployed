import { v4 as uuidv4 } from 'uuid';
import BaseAgent from './BaseAgent.js';
import ResearcherAgent from './ResearcherAgent.js';
import CVGeneratorAgent from './CVGeneratorAgent.js';
import ReviewerAgent from './ReviewerAgent.js';
import ApplicatorAgent from './ApplicatorAgent.js';
import { getMemoryKey } from '../services/memory.js';

const CONTEXT_FILES = [
  'identity.md',
  'identity-branding.md',
  'agent.md',
  'memory.md',
  'tools.md',
  'context.md',
];

const DEFAULT_CRITERIA = {
  keywords: [
    'AI Engineer',
    'Automation Engineer',
    'Software Developer',
    'Systems Analyst',
    'Solutions Engineer',
    'Technical Writer',
  ],
  location: 'remote',
  filters: {
    remoteOnly: true,
    j2Compatible: true,
  },
};

export default class OrchestratorAgent extends BaseAgent {
  constructor(options = {}) {
    super('orchestrator', options);

    this.systemPrompt = CONTEXT_FILES
      .map(f => this.loadContextFile(f))
      .join('\n\n---\n\n');

    this.researcher = new ResearcherAgent({ broadcast: options.broadcast });
    this.cvGenerator = new CVGeneratorAgent({ broadcast: options.broadcast });
    this.reviewer = new ReviewerAgent({ broadcast: options.broadcast });
    this.applicator = new ApplicatorAgent({ broadcast: options.broadcast });
  }

  async run(criteria = {}) {
    const runId = uuidv4();
    const mergedCriteria = { ...DEFAULT_CRITERIA, ...criteria };
    const errors = [];

    this.log('run_start', { runId, criteria: mergedCriteria });

    let matchedJobs = [];
    try {
      matchedJobs = await this.researcher.findJobs(mergedCriteria);
    } catch (err) {
      this.log('research_error', { runId, error: err.message });
      errors.push({ phase: 'research', error: err.message });
      return { runId, jobsFound: 0, cvsGenerated: 0, stored: 0, errors };
    }

    this.log('research_complete', { runId, jobsFound: matchedJobs.length });

    let cvsGenerated = 0;
    let stored = 0;
    let applied = 0;

    const settings = (await getMemoryKey('settings')) || {};
    const autoApply = settings.autoApply === true;

    for (const job of matchedJobs) {
      try {
        const cv = await this.cvGenerator.generateCV(job);
        cvsGenerated++;

        const result = await this.reviewer.reviewAndStore(job, cv, runId);
        if (result.stored) {
          stored++;

          if (autoApply && result.applicationId) {
            try {
              const applyResult = await this.applicator.applyToApplication(result.applicationId);
              if (applyResult?.success) applied++;
            } catch (applyErr) {
              this.log('auto_apply_error', { runId, applicationId: result.applicationId, error: applyErr.message });
              errors.push({ phase: 'auto_apply', job: job.title, error: applyErr.message });
            }
          }
        }
      } catch (err) {
        this.log('pipeline_error', { runId, jobTitle: job.title, error: err.message });
        errors.push({ phase: 'cv_pipeline', job: job.title, error: err.message });
      }
    }

    const runSummary = {
      runId,
      timestamp: new Date().toISOString(),
      jobsFound: matchedJobs.length,
      cvsGenerated,
      stored,
      errorCount: errors.length,
    };

    await this.remember('lastRun', runSummary);
    const history = (await this.recall('runHistory')) || [];
    history.push(runSummary);
    await this.remember('runHistory', history);

    this.log('run_complete', runSummary);

    return { runId, jobsFound: matchedJobs.length, cvsGenerated, stored, applied, errors };
  }

  async getRunHistory() {
    return (await this.recall('runHistory')) || [];
  }

  getDefaultCriteria() {
    return { ...DEFAULT_CRITERIA };
  }
}
