import BaseAgent from './BaseAgent.js';

export default class CVGeneratorAgent extends BaseAgent {
  constructor(options = {}) {
    super('cv-generator', options);

    const identityMd = this.loadContextFile('identity.md');
    const brandingMd = this.loadContextFile('identity-branding.md');
    const memoryMd = this.loadContextFile('memory.md');
    const agentMd = this.loadContextFile('agent.md');

    this.systemPrompt = [
      'You are a CV generation agent that creates tailored, ATS-friendly resumes.',
      'Follow the output standards, messaging framework, and quality bar defined below.',
      'Use the verb + what + how + impact bullet format.',
      '',
      '--- IDENTITY ---',
      identityMd,
      '',
      '--- BRANDING ---',
      brandingMd,
      '',
      '--- EXPERIENCE & MEMORY ---',
      memoryMd,
      '',
      '--- AGENT STANDARDS ---',
      agentMd,
    ].join('\n');
  }

  async generateCV(job) {
    const prompt = [
      'Generate a tailored CV for the following job. Respond in JSON: { "cv": "<full CV text>", "highlights": ["<tailoring point>", ...] }',
      '',
      `Job Title: ${job.title}`,
      `Company: ${job.company}`,
      `Source: ${job.source}`,
      `Job URL: ${job.url}`,
      '',
      'Job Description:',
      job.description || 'No description available.',
      '',
      'Requirements:',
      '- Match keywords from the job posting',
      '- Use verb + what + how + impact format for all bullets',
      '- Highlight relevant experience from the user memory/profile',
      '- Keep to 1-2 pages, ATS-friendly (no tables, graphics, or columns)',
      '- Include a dedicated "AI Engineering & Automation" skills block',
      '- Lead with delivered capability and outcomes, not buzzwords',
      '- Quantify results where possible (time saved, rework reduced, adoption increased)',
      '',
      `Match Score: ${job.score || 'N/A'}`,
      `Score Reasoning: ${job.reasoning || 'N/A'}`,
    ].join('\n');

    try {
      const result = await this.callWithJSON(prompt);
      this.log('cv_generated', { jobTitle: job.title, company: job.company, highlights: result.highlights?.length });
      return result;
    } catch (err) {
      this.log('cv_generation_error', { jobTitle: job.title, error: err.message });
      throw err;
    }
  }
}
