import { v4 as uuidv4 } from 'uuid';
import BaseAgent from './BaseAgent.js';
import { putApplication, findByJobLink } from '../services/dynamodb.js';

const MIN_QUALITY_SCORE = 70;

export default class ReviewerAgent extends BaseAgent {
  constructor(options = {}) {
    super('reviewer', options);

    const agentMd = this.loadContextFile('agent.md');
    this.systemPrompt = [
      'You are a CV quality reviewer. Evaluate CVs for completeness, keyword alignment,',
      'ATS-friendliness, and overall quality against the job posting.',
      'Apply the quality bar defined below.',
      '',
      '--- AGENT STANDARDS ---',
      agentMd,
    ].join('\n');
  }

  async reviewAndStore(job, cv, runId) {
    this.log('review_start', { jobTitle: job.title, company: job.company });

    const review = await this.reviewCV(job, cv);

    if (review.score < MIN_QUALITY_SCORE) {
      this.log('review_below_threshold', { jobTitle: job.title, score: review.score });
      return { stored: false, reason: 'quality below threshold', score: review.score, feedback: review.feedback };
    }

    const existing = await findByJobLink(job.url);
    if (existing) {
      this.log('duplicate_found', { jobTitle: job.title, existingId: existing.applicationId });
      return { stored: false, reason: 'duplicate application', applicationId: existing.applicationId, score: review.score };
    }

    try {
      const record = await putApplication({
        applicationId: uuidv4(),
        roleTitle: job.title,
        company: job.company,
        jobLink: job.url,
        source: job.source,
        tailoredCV: cv.cv,
        status: 'ready',
        matchScore: job.score,
        tags: job.tags || [],
        runId,
      });

      this.log('application_stored', { applicationId: record.applicationId, jobTitle: job.title });
      return { stored: true, applicationId: record.applicationId, score: review.score, feedback: review.feedback };
    } catch (err) {
      this.log('store_error', { jobTitle: job.title, error: err.message });
      return { stored: false, reason: 'storage error', error: err.message, score: review.score };
    }
  }

  async reviewCV(job, cv) {
    const cvText = typeof cv === 'string' ? cv : cv.cv;

    const prompt = [
      'Review this CV against the job posting. Respond ONLY in JSON:',
      '{ "score": <0-100>, "feedback": "<string>", "completeness": <0-100>, "keywordAlignment": <0-100>, "atsFriendly": <bool>, "issues": ["<string>", ...] }',
      '',
      `Job Title: ${job.title}`,
      `Company: ${job.company}`,
      `Description (first 500 chars): ${(job.description || '').slice(0, 500)}`,
      '',
      'CV Content:',
      cvText,
      '',
      'Evaluate on:',
      '1. Completeness: All sections present (contact, summary, experience, skills, education)',
      '2. Keyword alignment: CV keywords match the job posting',
      '3. ATS-friendliness: Clean formatting, no tables/graphics/columns, standard section headers',
      '4. Quality: Bullets use verb + what + how + impact format, outcomes are quantified',
    ].join('\n');

    try {
      return await this.callWithJSON(prompt);
    } catch (err) {
      this.log('review_parse_error', { jobTitle: job.title, error: err.message });
      return { score: 0, feedback: 'Review failed: ' + err.message, issues: ['LLM response parse error'] };
    }
  }
}
