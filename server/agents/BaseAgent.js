import fs from 'fs';
import path from 'path';
import { chatCompletion } from '../services/groq.js';
import { getMemoryKey, setMemoryKey } from '../services/memory.js';

const CONTEXT_DIR = path.join(process.cwd(), 'context');

export function buildMessage(event, data = {}) {
  const d = data;
  switch (event) {
    case 'run_start':
      return 'Pipeline started — searching for jobs';
    case 'find_jobs_start':
      return `Searching job sources (${Array.isArray(d.keywords) ? d.keywords.length : 'multiple'} keywords)`;
    case 'linkedin_skipped':
      return 'LinkedIn skipped — no cookie set. Add one in Settings.';
    case 'scraper_success':
      return `${d.source || 'source'}: found ${d.count ?? 0} jobs`;
    case 'scraper_error':
      return `${d.source || 'source'}: scraper failed — ${d.error || 'unknown error'}`;
    case 'dedup_complete':
      return `Deduplicated to ${d.after ?? 0} unique jobs (was ${d.before ?? 0})`;
    case 'find_jobs_complete':
      return `Scoring complete — ${d.matched ?? 0} jobs matched criteria (${d.total ?? 0} unique before scoring)`;
    case 'score_error':
      return `Scoring failed for "${d.job || 'job'}": ${d.error || ''}`;
    case 'research_complete':
      return `Research: ${d.jobsFound ?? 0} jobs matched criteria`;
    case 'research_error':
      return `Research failed: ${d.error || ''}`;
    case 'cv_generated':
      return `CV generated for ${d.jobTitle || 'role'} at ${d.company || 'company'}`;
    case 'cv_generation_error':
      return `CV generation failed for ${d.jobTitle || 'role'}: ${d.error || ''}`;
    case 'review_start':
      return `Reviewing CV for ${d.jobTitle || 'role'} at ${d.company || 'company'}`;
    case 'review_below_threshold':
      return `CV below quality threshold (${d.score ?? '?'}) for ${d.jobTitle || 'role'}`;
    case 'duplicate_found':
      return `Duplicate skipped: ${d.jobTitle || 'role'} already in database`;
    case 'application_stored':
      return `Saved application: ${d.jobTitle || 'role'}`;
    case 'store_error':
      return `Store failed for ${d.jobTitle || 'role'}: ${d.error || ''}`;
    case 'review_parse_error':
      return `Review parse error for ${d.jobTitle || 'role'}: ${d.error || ''}`;
    case 'run_complete': {
      const j = d.jobsFound ?? 0;
      const c = d.cvsGenerated ?? 0;
      const s = d.stored ?? 0;
      return `Run complete — ${j} found, ${c} CVs generated, ${s} saved`;
    }
    case 'pipeline_error':
      return `Pipeline error on ${d.jobTitle || 'job'}: ${d.error || ''}`;
    case 'auto_apply_error':
      return `Auto-apply failed (${d.applicationId || ''}): ${d.error || ''}`;
    case 'llm_call':
      return `LLM call (${d.promptLength ?? '?'} → ${d.responseLength ?? '?'} chars)`;
    case 'dispatch':
      return `Dispatched to ${d.to || 'agent'}: ${d.task || ''}`;
    case 'process_message':
      return `Processing message from ${d.from || '?'}: ${d.task || ''}`;
    case 'remember':
      return `Memory updated: ${d.key || ''}`;
    case 'apply_start':
      return `Applying to ${d.roleTitle || d.applicationId || 'application'}`;
    case 'apply_progress': {
      const think = d.thinking
        ? ` — "${String(d.thinking).slice(0, 140)}${String(d.thinking).length > 140 ? '...' : ''}"`
        : '';
      const phase = d.phase ? ` [${d.phase}]` : '';
      return `Apply${phase}: ${d.message || ''}${think}`;
    }
    case 'apply_blocked':
      return `Apply paused — intervention required (${d.reason || ''})`;
    case 'apply_resumed':
      return 'Apply resumed after intervention';
    case 'apply_skipped':
      return 'Apply skipped by operator';
    case 'apply_success':
      return `Application submitted (${d.applicationId || ''})`;
    case 'apply_blocked_final':
      return `Apply blocked: ${d.reason || ''}`;
    case 'apply_failed':
      return `Apply failed: ${d.error || ''}`;
    default: {
      const snippet = Object.keys(d).length ? JSON.stringify(d).slice(0, 200) : '';
      return snippet ? `${event} — ${snippet}` : String(event);
    }
  }
}

export default class BaseAgent {
  constructor(name, options = {}) {
    this.name = name;
    this.broadcast = options.broadcast || null;
    this.systemPrompt = '';
    this.inbox = [];
    this.logs = [];
    this._pendingDispatches = new Map();
  }

  async call(prompt, systemContext = '') {
    const messages = [
      { role: 'system', content: this.systemPrompt + (systemContext ? `\n\n${systemContext}` : '') },
      { role: 'user', content: prompt },
    ];

    const content = await chatCompletion(messages);
    this.log('llm_call', { promptLength: prompt.length, responseLength: content.length });
    return content;
  }

  async callWithJSON(prompt, systemContext = '') {
    const raw = await this.call(prompt, systemContext);

    try {
      return JSON.parse(raw);
    } catch {
      const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (fenceMatch) {
        return JSON.parse(fenceMatch[1].trim());
      }
      throw new Error(`Failed to parse JSON from LLM response: ${raw.slice(0, 200)}`);
    }
  }

  dispatch(targetAgent, task, payload) {
    const id = `${this.name}->${targetAgent.name}:${Date.now()}`;
    const message = { id, from: this.name, task, payload, timestamp: new Date().toISOString() };

    return new Promise((resolve) => {
      targetAgent.inbox.push({ ...message, resolve });
      this.log('dispatch', { to: targetAgent.name, task });
    });
  }

  async processInbox() {
    while (this.inbox.length > 0) {
      const message = this.inbox.shift();
      this.log('process_message', { from: message.from, task: message.task });
      const result = await this.handleMessage(message);
      if (message.resolve) message.resolve(result);
    }
  }

  async handleMessage(message) {
    return { received: true, agent: this.name, task: message.task };
  }

  async remember(key, value) {
    const namespacedKey = `agents.${this.name}.${key}`;
    await setMemoryKey(namespacedKey, value);
    this.log('remember', { key: namespacedKey });
  }

  async recall(key) {
    const namespacedKey = `agents.${this.name}.${key}`;
    return getMemoryKey(namespacedKey);
  }

  log(event, data = {}) {
    const message = buildMessage(event, data);
    const entry = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      event,
      ...data,
      message, // human-readable; must not be overwritten by data.message (e.g. apply_progress)
    };

    this.logs.push(entry);

    if (this.broadcast) {
      this.broadcast({ type: 'agent_log', ...entry });
    }
  }

  loadContextFile(filename) {
    const filePath = path.join(CONTEXT_DIR, filename);
    return fs.readFileSync(filePath, 'utf-8');
  }
}
