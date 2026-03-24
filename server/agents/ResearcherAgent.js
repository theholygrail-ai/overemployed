import BaseAgent from './BaseAgent.js';
import { scrapeRemoteOK } from '../services/scrapers/remoteok.js';
import { scrapeRemotive } from '../services/scrapers/remotive.js';
import { scrapeAdzuna } from '../services/scrapers/adzuna.js';
import { scrapeLinkedIn } from '../services/scrapers/linkedin.js';
import { getMemoryKey } from '../services/memory.js';
import { DEFAULT_JOB_KEYWORDS } from '../config/defaultJobCriteria.js';

const SCORE_BATCH_SIZE = 5;
const MIN_SCORE = 60;

export default class ResearcherAgent extends BaseAgent {
  constructor(options = {}) {
    super('researcher', options);

    const contextMd = this.loadContextFile('context.md');
    const identityMd = this.loadContextFile('identity.md');
    this.systemPrompt = [
      'You are a job research agent specializing in finding remote-compatible roles.',
      'Evaluate jobs against the user profile and J2 suitability criteria below.',
      '',
      '--- CONTEXT ---',
      contextMd,
      '',
      '--- IDENTITY ---',
      identityMd,
    ].join('\n');
  }

  async findJobs(criteria = {}) {
    const keywords =
      Array.isArray(criteria.keywords) && criteria.keywords.length > 0
        ? criteria.keywords
        : DEFAULT_JOB_KEYWORDS;
    this.log('find_jobs_start', { keywords, criteria });

    const linkedInData = await getMemoryKey('linkedin');
    const liAtCookie = linkedInData?.liAtCookie || null;

    if (!liAtCookie) {
      this.log('linkedin_skipped', { reason: 'No li_at cookie configured. Set it in Settings > LinkedIn Session.' });
    }

    const scraperResults = await Promise.allSettled([
      scrapeRemoteOK(keywords),
      scrapeRemotive(keywords),
      scrapeAdzuna(keywords),
      scrapeLinkedIn(keywords, { location: criteria.location || 'Remote', liAtCookie }),
    ]);

    const allJobs = [];
    const sources = ['remoteok', 'remotive', 'adzuna', 'linkedin'];

    scraperResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        this.log('scraper_success', { source: sources[i], count: result.value.length });
        allJobs.push(...result.value);
      } else {
        this.log('scraper_error', { source: sources[i], error: result.reason?.message });
      }
    });

    const unique = this.deduplicateJobs(allJobs);
    this.log('dedup_complete', { before: allJobs.length, after: unique.length });

    const scored = [];
    for (let i = 0; i < unique.length; i += SCORE_BATCH_SIZE) {
      const batch = unique.slice(i, i + SCORE_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(job => this.scoreJob(job).catch(err => {
          this.log('score_error', { job: job.title, error: err.message });
          return null;
        }))
      );
      scored.push(...batchResults.filter(Boolean));
    }

    const matched = scored
      .filter(j => j.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score);

    this.log('find_jobs_complete', { total: unique.length, matched: matched.length });
    return matched;
  }

  async scoreJob(job) {
    const snippet = (job.description || '').slice(0, 500);

    const prompt = [
      'Score this job for the user profile. Respond ONLY in JSON: { "score": <0-100>, "reasoning": "<string>", "j2Compatible": <bool>, "skillMatch": <0-100> }',
      '',
      `Title: ${job.title}`,
      `Company: ${job.company}`,
      `Location: ${job.location}`,
      `Source: ${job.source}`,
      `Description: ${snippet}`,
      '',
      'Scoring dimensions (weight equally):',
      '1. Remote-friendliness: Is this clearly remote/async?',
      '2. J2-compatibility: Low meetings, outcome-based, no strict time tracking?',
      '3. Skill match: Alignment with AI engineering, automation, systems analysis, technical writing?',
      '4. Role fit: Does this match target role buckets from the profile?',
    ].join('\n');

    const result = await this.callWithJSON(prompt);

    return {
      ...job,
      score: result.score,
      reasoning: result.reasoning,
      j2Compatible: result.j2Compatible,
      skillMatch: result.skillMatch,
    };
  }

  deduplicateJobs(jobs) {
    const seenUrls = new Set();
    const seenTitles = new Set();

    return jobs.filter(job => {
      const normalizedUrl = (job.url || '').toLowerCase().replace(/\/+$/, '').replace(/\?.*$/, '');
      if (normalizedUrl && seenUrls.has(normalizedUrl)) return false;

      const titleKey = `${(job.title || '').toLowerCase().trim()}::${(job.company || '').toLowerCase().trim()}`;
      if (seenTitles.has(titleKey)) return false;

      if (normalizedUrl) seenUrls.add(normalizedUrl);
      seenTitles.add(titleKey);
      return true;
    });
  }
}
