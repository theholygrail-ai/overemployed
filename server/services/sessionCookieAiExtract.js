/**
 * Use Groq (GPT-OSS 120B by default) to turn pasted DevTools / Network / HAR JSON into
 * normalized cookie objects for automation session storage.
 */
import { chatCompletion } from './groq.js';
import { parseCookiesInput } from './sessionCookies.js';

const MODEL = process.env.GROQ_SESSION_EXTRACT_MODEL || 'openai/gpt-oss-120b';
const MAX_RAW_CHARS = 150_000;

const SYSTEM_PROMPT = `You extract browser session data for job-application automation (Playwright/Puppeteer).

The user pastes messy data: Chrome DevTools Application storage export, Network tab response JSON, HAR fragments, cookie header strings, or arrays of cookie-like objects.

Your job:
1. Identify every HTTP cookie relevant to staying logged in on the target site (e.g. session, auth tokens, cf_clearance, __Host-*, __Secure-*, etc.).
2. Output a STRICT JSON object ONLY — no markdown, no commentary outside JSON.
3. Shape:
{
  "cookies": [
    {
      "name": "string",
      "value": "string",
      "domain": "string (use leading dot for site-wide cookies when appropriate, e.g. .linkedin.com)",
      "path": "/",
      "secure": true or false (optional),
      "httpOnly": true or false (optional),
      "sameSite": "Lax" | "Strict" | "None" or omit
    }
  ],
  "liAtSuggestion": "string or null — if you find LinkedIn li_at value, put it here; else null",
  "notes": "short optional note for the user"
}

Rules:
- Every cookie MUST have name, value, domain, path (path is usually "/").
- Preserve exact cookie values (do not truncate secrets).
- If the paste is a Cookie header string with pairs a=b; c=d, infer domain from hints or use the hint defaultDomain.
- Remove duplicate cookies (same name+domain); keep the most complete.
- If nothing usable is found, return {"cookies":[],"liAtSuggestion":null,"notes":"No cookies found in paste."}
`;

function stripCodeFence(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return text.trim();
}

function parseJsonLoose(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Model did not return valid JSON');
  }
}

/**
 * @param {string} raw - pasted text
 * @param {{ defaultDomainHint?: string, siteHint?: string }} hints
 * @returns {Promise<{ cookies: object[], liAtSuggestion: string|null, notes: string, validatedCount: number }>}
 */
export async function extractSessionCookiesWithGroq(raw, hints = {}) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured on the server');
  }

  const truncated = String(raw || '').slice(0, MAX_RAW_CHARS);
  if (!truncated.trim()) {
    throw new Error('Paste is empty');
  }

  const hintBlock = JSON.stringify({
    defaultDomainHint: hints.defaultDomainHint || null,
    siteHint: hints.siteHint || null,
  });

  const userMsg = `CONTEXT HINTS (may be null): ${hintBlock}

PASTED DATA:
${truncated}`;

  const content = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    {
      model: MODEL,
      temperature: 0.1,
      max_tokens: 16_384,
    },
  );

  const parsed = parseJsonLoose(content);
  const arr = Array.isArray(parsed.cookies) ? parsed.cookies : [];

  let validated;
  try {
    validated = parseCookiesInput(JSON.stringify(arr), hints.defaultDomainHint || '');
  } catch (e) {
    throw new Error(`Extracted JSON could not be parsed as cookies: ${e.message}`);
  }

  const liAt =
    typeof parsed.liAtSuggestion === 'string' && parsed.liAtSuggestion.trim()
      ? parsed.liAtSuggestion.trim()
      : null;
  const notes = typeof parsed.notes === 'string' ? parsed.notes : '';

  return {
    cookies: validated,
    liAtSuggestion: liAt,
    notes,
    validatedCount: validated.length,
    model: MODEL,
  };
}
