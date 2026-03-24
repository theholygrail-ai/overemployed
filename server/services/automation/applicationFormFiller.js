/**
 * Fill application forms using the tailored CV for this application + user profile,
 * with Groq batch resolution for coherent answers. Falls back to heuristics if Groq is unavailable.
 */
import { chatCompletion } from '../groq.js';

const MAX_CV_CHARS = 16_000;
const MAX_FIELDS = 40;
const FILL_MODEL = process.env.GROQ_APPLY_FILL_MODEL || 'openai/gpt-oss-120b';

/**
 * @typedef {object} KnowledgePack
 * @property {string} tailoredCV - Full generated CV text for this application
 * @property {string} [roleTitle]
 * @property {string} [company]
 * @property {string} [applicationId]
 */

function truncateCv(text) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  return t.length <= MAX_CV_CHARS ? t : `${t.slice(0, MAX_CV_CHARS)}\n…[truncated]`;
}

/**
 * Collect visible text inputs + textareas in DOM order (same order used for filling).
 */
export async function gatherFieldDescriptorsPlaywright(page) {
  return page.evaluate(() => {
    const sel =
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="search"], textarea';
    const nodes = [...document.querySelectorAll(sel)].filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.disabled || el.readOnly) return false;
      return true;
    });

    return nodes.map((el, index) => {
      const tag = el.tagName.toLowerCase();
      const type = el.type || '';
      const aria = el.getAttribute('aria-label') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      let label = '';
      const l = el.closest('label');
      if (l) label = l.textContent.trim();
      else if (id) {
        const forL = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (forL) label = forL.textContent.trim();
      }
      const combined = [label, aria, placeholder, name, id].filter(Boolean).join(' | ');
      return {
        index,
        tag,
        type,
        combined: combined.slice(0, 800),
      };
    });
  });
}

export async function gatherFieldDescriptorsPuppeteer(page) {
  return page.evaluate(() => {
    const sel =
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="search"], textarea';
    const nodes = [...document.querySelectorAll(sel)].filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.disabled || el.readOnly) return false;
      return true;
    });

    return nodes.map((el, index) => {
      const tag = el.tagName.toLowerCase();
      const type = el.type || '';
      const aria = el.getAttribute('aria-label') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      let label = '';
      const l = el.closest('label');
      if (l) label = l.textContent.trim();
      else if (id) {
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const forL = document.querySelector(`label[for="${esc}"]`);
        if (forL) label = forL.textContent.trim();
      }
      const combined = [label, aria, placeholder, name, id].filter(Boolean).join(' | ');
      return {
        index,
        tag,
        type,
        combined: combined.slice(0, 800),
      };
    });
  });
}

function heuristicAnswers(descriptors, knowledgePack, profile) {
  const cv = (knowledgePack?.tailoredCV || '').toLowerCase();
  const answers = descriptors.map((d) => {
    const hint = (d.combined || '').toLowerCase();
    const p = profile || {};

    if (hint.includes('email') || hint.includes('e-mail')) return p.email || '';
    if (hint.includes('phone') || hint.includes('mobile') || hint.includes('tel')) return p.phone || '';
    if (hint.includes('first name') || hint.includes('firstname')) {
      const parts = (p.name || '').split(/\s+/);
      return parts[0] || '';
    }
    if (hint.includes('last name') || hint.includes('surname') || hint.includes('lastname')) {
      const parts = (p.name || '').split(/\s+/);
      return parts.slice(1).join(' ') || '';
    }
    if (hint.includes('full name') || (hint.includes('name') && !hint.includes('company'))) return p.name || '';
    if (hint.includes('linkedin')) return p.linkedinUrl || '';
    if (hint.includes('city') || hint.includes('location')) return p.address || p.city || '';
    if (d.tag === 'textarea' && cv.length > 50) {
      const snippet = knowledgePack.tailoredCV.trim().split(/\n\n+/).find((x) => x.length > 40);
      return snippet
        ? `I am excited to apply for this role. ${snippet.slice(0, 600)}`.trim()
        : 'I am excited to apply for this position. Please find my resume attached.';
    }
    return '';
  });
  return answers;
}

function stripJsonFence(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : text.trim();
}

/**
 * Batch-resolve field values from tailored CV + profile via Groq.
 * @param {{ heuristicOnly?: boolean }} opts - if true, skip Groq (e.g. LinkedIn step 2+)
 * @returns {Promise<string[]>} parallel to descriptors
 */
export async function resolveFieldAnswersWithGroq(descriptors, knowledgePack, profile, opts = {}) {
  if (opts.heuristicOnly || !process.env.GROQ_API_KEY || !descriptors.length) {
    return heuristicAnswers(descriptors, knowledgePack, profile);
  }

  const fields = descriptors.slice(0, MAX_FIELDS).map((d, i) => ({
    i,
    hint: d.combined,
    tag: d.tag,
  }));

  const system = `You fill job application forms. You must ONLY use facts from the provided CV text and user profile JSON. Be consistent: contact details must match the profile exactly when the field asks for email/phone/name. For open-ended questions, write 1–4 sentences grounded in the CV. For salary/availability, use neutral professional wording if not stated in CV. Output ONLY valid JSON, no markdown.`;

  const user = `TARGET ROLE: ${knowledgePack?.roleTitle || 'Unknown'} at ${knowledgePack?.company || 'Unknown'}

USER PROFILE (canonical for contact fields):
${JSON.stringify(profile || {}, null, 2)}

TAILORED CV FOR THIS APPLICATION (use as the source of truth for experience, skills, education):
${truncateCv(knowledgePack?.tailoredCV || '')}

FORM FIELDS (in order — produce one answer per field, same array length):
${JSON.stringify(fields, null, 2)}

Return JSON exactly in this shape:
{"answers":["answer for field i=0","answer for field i=1",...]}
Use empty string "" if the field should stay blank or is not applicable. There must be exactly ${fields.length} strings in "answers".`;

  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { model: FILL_MODEL, temperature: 0.2, max_tokens: 8_192 },
    );
    const parsed = JSON.parse(stripJsonFence(raw));
    const arr = Array.isArray(parsed.answers) ? parsed.answers : [];
    const out = fields.map((_, idx) => String(arr[idx] ?? '').trim());
    if (out.length !== fields.length) {
      throw new Error('Answer count mismatch');
    }
    return out;
  } catch (err) {
    console.warn('[applicationFormFiller] Groq batch fill failed, using heuristics:', err.message);
    return heuristicAnswers(descriptors, knowledgePack, profile);
  }
}

function fillDomFieldsEvaluateScript() {
  return (payload) => {
    const answers = payload.answers;
    const sel =
      'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="search"], textarea';
    const nodes = [...document.querySelectorAll(sel)].filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (el.disabled || el.readOnly) return false;
      return true;
    });

    const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    const nativeTextarea = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    let filled = 0;
    nodes.forEach((el, i) => {
      const val = answers[i];
      if (!val || String(val).trim() === '') return;
      if (el.value && el.value.trim()) return;
      if (el.tagName === 'TEXTAREA' && nativeTextarea) {
        nativeTextarea.call(el, val);
      } else if (nativeInput) {
        nativeInput.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      filled += 1;
    });
    return filled;
  };
}

/** @param {{ heuristicOnly?: boolean }} fillOpts */
export async function fillPlaywrightFromKnowledge(page, knowledgePack, profile, onProgress, fillOpts = {}) {
  const hasCv = Boolean(knowledgePack?.tailoredCV && knowledgePack.tailoredCV.trim().length > 20);
  if (!hasCv) {
    onProgress?.('No tailored CV text in context — using profile heuristics only');
  } else if (fillOpts.heuristicOnly) {
    onProgress?.('Filling fields (heuristic pass for this step)…');
  } else {
    onProgress?.('Analyzing form fields against tailored CV & profile (Groq)…');
  }

  const descriptors = await gatherFieldDescriptorsPlaywright(page);
  if (!descriptors.length) return;

  const answers = await resolveFieldAnswersWithGroq(descriptors, knowledgePack, profile, {
    heuristicOnly: fillOpts.heuristicOnly,
  });
  const filled = await page.evaluate(fillDomFieldsEvaluateScript(), { answers });
  onProgress?.(`Filled ${filled} field(s) from CV/profile resolution`);
}

/** @param {{ heuristicOnly?: boolean }} fillOpts */
export async function fillPuppeteerFromKnowledge(page, knowledgePack, profile, onProgress, fillOpts = {}) {
  const hasCv = Boolean(knowledgePack?.tailoredCV && knowledgePack.tailoredCV.trim().length > 20);
  if (!hasCv) {
    onProgress?.('No tailored CV text in context — using profile heuristics only');
  } else if (fillOpts.heuristicOnly) {
    onProgress?.('Filling fields (heuristic pass for this step)…');
  } else {
    onProgress?.('Analyzing form fields against tailored CV & profile (Groq)…');
  }

  const descriptors = await gatherFieldDescriptorsPuppeteer(page);
  if (!descriptors.length) return;

  const answers = await resolveFieldAnswersWithGroq(descriptors, knowledgePack, profile, {
    heuristicOnly: fillOpts.heuristicOnly,
  });

  const filled = await page.evaluate(fillDomFieldsEvaluateScript(), { answers });
  onProgress?.(`Filled ${filled} field(s) from CV/profile resolution`);
}
