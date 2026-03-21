import BaseAgent from './BaseAgent.js';
import { generateDocx, getDocxPath } from '../services/docxFormatter.js';
import { applyToJob } from '../services/automation/automationRouter.js';
import { createBlocker, waitForResolution } from '../services/hitl.js';
import { getApplication, updateApplicationStatus } from '../services/dynamodb.js';
import { getMemoryKey } from '../services/memory.js';
import path from 'path';
import fs from 'fs/promises';

export default class ApplicatorAgent extends BaseAgent {
  constructor(options = {}) {
    super('applicator', options);

    try {
      const agentMd = this.loadContextFile('agent.md');
      this.systemPrompt = 'You are a job application agent.\n\n' + agentMd;
    } catch {
      this.systemPrompt = 'You are a job application agent.';
    }
  }

  async applyToApplication(applicationId) {
    const application = await getApplication(applicationId);
    if (!application) throw new Error(`Application ${applicationId} not found`);

    await updateApplicationStatus(applicationId, 'applying');
    this.log('apply_start', { applicationId, roleTitle: application.roleTitle });

    let cvPath = await getDocxPath(applicationId);
    if (!cvPath) {
      cvPath = await generateDocx(application.tailoredCV || '', applicationId);
    }

    const profile = (await getMemoryKey('userProfile')) || {
      name: 'Erwin Mothoa',
      email: 'Erwinmothoa93@gmail.com',
      phone: '+27 62 194 3898',
    };

    const artifactsDir = path.join(process.cwd(), 'data', 'artifacts');
    let artifacts = [];
    try {
      const files = await fs.readdir(artifactsDir);
      artifacts = files.map(f => ({ filename: f, path: path.join(artifactsDir, f) }));
    } catch { /* no artifacts dir */ }

    const linkedInData = await getMemoryKey('linkedin');
    const liAtCookie = linkedInData?.liAtCookie || null;

    const job = {
      url: application.jobLink,
      title: application.roleTitle,
      company: application.company,
      source: application.source,
    };

    const result = await applyToJob(job, cvPath, profile, artifacts, {
      liAtCookie,
      onProgress: (msg) => this.log('apply_progress', { applicationId, message: msg }),
      onBlocker: async (reason, screenshot, url) => {
        const blocker = await createBlocker(applicationId, reason, screenshot, url);
        this.log('apply_blocked', { applicationId, blockerId: blocker.id, reason });
        await updateApplicationStatus(applicationId, 'blocked');
        try {
          await waitForResolution(blocker.id);
          this.log('apply_resumed', { applicationId, blockerId: blocker.id });
          await updateApplicationStatus(applicationId, 'applying');
        } catch {
          this.log('apply_skipped', { applicationId, blockerId: blocker.id });
        }
      },
    });

    if (result.success) {
      await updateApplicationStatus(applicationId, 'applied');
      this.log('apply_success', { applicationId });
    } else if (result.status === 'blocked') {
      await updateApplicationStatus(applicationId, 'blocked');
      this.log('apply_blocked_final', { applicationId, reason: result.blockerReason });
    } else {
      await updateApplicationStatus(applicationId, 'failed');
      this.log('apply_failed', { applicationId, error: result.message });
    }

    return result;
  }
}
