import BaseAgent from './BaseAgent.js';
import { generateDocx, getDocxPath } from '../services/docxFormatter.js';
import { generatePdf, getPdfPath } from '../services/cvPdf.js';
import { applyToJob } from '../services/automation/automationRouter.js';
import { createBlocker } from '../services/hitl.js';
import { getApplication, updateApplicationStatus, updateApplicationStatusWithApplyProof } from '../services/dynamodb.js';
import { normalizeApplyScreenshots, saveApplyProof } from '../services/applyProof.js';
import { getMemoryKey } from '../services/memory.js';
import { getStoredSessionCookies } from '../services/sessionCookies.js';
import { dataRoot } from '../lib/dataPath.js';
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

    let docxPath = await getDocxPath(applicationId);
    if (!docxPath) {
      docxPath = await generateDocx(application.tailoredCV || '', applicationId);
    }
    let pdfPath = await getPdfPath(applicationId);
    if (!pdfPath) {
      pdfPath = await generatePdf(application.tailoredCV || '', applicationId);
    }
    const cvAssets = { docxPath, pdfPath };

    const profile = (await getMemoryKey('userProfile')) || {
      name: 'Erwin Mothoa',
      email: 'Erwinmothoa93@gmail.com',
      phone: '+27 62 194 3898',
    };

    const artifactsDir = path.join(dataRoot(), 'artifacts');
    let artifacts = [];
    try {
      const files = await fs.readdir(artifactsDir);
      artifacts = files.map(f => ({ filename: f, path: path.join(artifactsDir, f) }));
    } catch { /* no artifacts dir */ }

    const linkedInData = await getMemoryKey('linkedin');
    const liAtCookie = linkedInData?.liAtCookie || null;

    const { cookies: sessionCookies } = await getStoredSessionCookies();
    const siteCredentials = (await getMemoryKey('applySiteCredentials')) || {};

    const job = {
      url: application.jobLink,
      title: application.roleTitle,
      company: application.company,
      source: application.source,
    };

    const knowledgePack = {
      tailoredCV: application.tailoredCV || '',
      roleTitle: application.roleTitle || '',
      company: application.company || '',
      applicationId,
    };

    this.log('apply_cv_context', {
      applicationId,
      hasTailoredCV: Boolean(application.tailoredCV && String(application.tailoredCV).trim().length > 50),
      docx: path.basename(docxPath),
      pdf: path.basename(pdfPath),
    });

    const result = await applyToJob(job, cvAssets, profile, artifacts, {
      knowledgePack,
      liAtCookie,
      sessionCookies,
      siteCredentials,
      groqApiKey: process.env.GROQ_API_KEY,
      novaActApiKey: process.env.NOVA_ACT_API_KEY,
      plannerModel: process.env.GROQ_NOVA_PLANNER_MODEL,
      headless: process.env.NOVA_ACT_HEADLESS === 'true',
      onProgress: (msg) => this.log('apply_progress', { applicationId, message: msg }),
      onBlocker: async (reason, screenshot, url) => {
        const blocker = await createBlocker(applicationId, reason, screenshot, url);
        this.log('apply_blocked', { applicationId, blockerId: blocker.id, reason });
        await updateApplicationStatus(applicationId, 'blocked');
        return blocker;
      },
    });

    if (result.success && result.verified !== false) {
      const shots = normalizeApplyScreenshots(result);
      let applyProof = null;
      if (shots.length) {
        try {
          applyProof = await saveApplyProof(applicationId, shots);
          if (applyProof) applyProof.engine = result.engine || null;
        } catch (err) {
          this.log('apply_proof_save_failed', { applicationId, error: err.message });
        }
      }
      if (applyProof) {
        await updateApplicationStatusWithApplyProof(applicationId, 'applied', applyProof);
      } else {
        await updateApplicationStatus(applicationId, 'applied');
      }
      this.log('apply_success', { applicationId, proofShots: applyProof?.shots?.length ?? 0, verified: result.verified !== false });
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
