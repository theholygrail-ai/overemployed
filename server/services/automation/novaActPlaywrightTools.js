/**
 * Executes Nova Act AWL-style tool calls against a Playwright page.
 * Mirrors argument shapes from aws/nova-act prepare_kwargs_for_actuation_calls.
 */

function basename(name) {
  if (!name || typeof name !== 'string') return '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1) : name;
}

function parseBox(box) {
  if (box == null) return null;
  if (typeof box === 'object' && !Array.isArray(box)) {
    const x = Number(box.x ?? box.left);
    const y = Number(box.y ?? box.top);
    const w = Number(box.width ?? box.w);
    const h = Number(box.height ?? box.h);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x: x + (Number.isFinite(w) ? w / 2 : 0), y: y + (Number.isFinite(h) ? h / 2 : 0) };
    }
  }
  const s = String(box).trim();
  const parts = s.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n));
  if (parts.length >= 4) {
    const [a, b, c, d] = parts;
    return { x: (a + c) / 2, y: (b + d) / 2 };
  }
  return null;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function settlePage(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 12_000 });
  } catch {
    await delay(800);
  }
}

async function takeObservation(page) {
  const buf = await page.screenshot({ type: 'png' });
  const b64 = Buffer.from(buf).toString('base64');
  return {
    screenshotBase64: `data:image/png;base64,${b64}`,
    activeURL: page.url(),
    simplifiedDOM: '',
  };
}

/**
 * @param {import('playwright').Page} page
 * @param {{ callId: string, name: string, input: unknown }} call
 * @param {(s: string) => void} onTrace
 */
export async function executeNovaActCall(page, call, onTrace) {
  const name = basename(call.name);
  const input = call.input;

  if (name === 'initiateAct') {
    return {};
  }

  if (name === 'wait') {
    const args = Array.isArray(input) ? input : [];
    const sec = args[0] != null ? Number(args[0]) : 0.5;
    await delay(Math.min(60_000, Math.max(0, sec * 1000)));
    return { waited: sec };
  }

  if (name === 'waitForPageToSettle') {
    await settlePage(page);
    return { settled: true };
  }

  if (name === 'takeObservation') {
    return takeObservation(page);
  }

  if (name === 'goToUrl') {
    const args = Array.isArray(input) ? input : [];
    const url = String(args[0] || '').trim();
    if (!url) throw new Error('goToUrl missing url');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await settlePage(page);
    return { url };
  }

  if (name === 'agentClick') {
    const args = Array.isArray(input) ? input : [];
    const pt = parseBox(args[0]);
    if (!pt) throw new Error(`agentClick bad box: ${JSON.stringify(args[0])}`);
    await page.mouse.click(pt.x, pt.y);
    await delay(120);
    return { clicked: pt };
  }

  if (name === 'agentHover') {
    const args = Array.isArray(input) ? input : [];
    const pt = parseBox(args[0]);
    if (!pt) throw new Error(`agentHover bad box: ${JSON.stringify(args[0])}`);
    await page.mouse.move(pt.x, pt.y);
    return { hovered: pt };
  }

  if (name === 'agentScroll') {
    const args = Array.isArray(input) ? input : [];
    const direction = String(args[0] || 'down');
    const box = args[1];
    const pt = parseBox(box) || { x: 400, y: 400 };
    await page.mouse.move(pt.x, pt.y);
    const delta = direction.toLowerCase().includes('up') ? -400 : 400;
    await page.mouse.wheel(0, delta);
    return { scrolled: direction };
  }

  if (name === 'agentType') {
    const args = Array.isArray(input) ? input : [];
    const value = String(args[0] ?? '');
    const pt = parseBox(args[1]);
    let pressEnter = false;
    if (args[2] != null) {
      if (typeof args[2] === 'object' && args[2].pressEnter != null) {
        pressEnter = Boolean(args[2].pressEnter);
      } else {
        pressEnter = Boolean(args[2]);
      }
    }
    if (pt) await page.mouse.click(pt.x, pt.y);
    await page.keyboard.type(value, { delay: 15 });
    if (pressEnter) await page.keyboard.press('Enter');
    return { typed: value.length };
  }

  if (name === 'think') {
    const args = Array.isArray(input) ? input : [];
    const msg = String(args[0] ?? '');
    onTrace?.(`💭 ${msg}`);
    return { think: msg };
  }

  if (name === 'return') {
    const args = Array.isArray(input) ? input : [];
    return { returnValue: args.length ? args[0] : '' };
  }

  if (name === 'throw' || name === 'throwAgentError') {
    const args = Array.isArray(input) ? input : [];
    const msg = String(args[0] ?? 'Agent error');
    throw new Error(msg);
  }

  if (name === 'tool' && input && typeof input === 'object' && !Array.isArray(input)) {
    const innerName = String(input.name || '');
    const innerInput = input.input;
    return await executeNovaActCall(
      page,
      { callId: call.callId, name: innerName, input: innerInput },
      onTrace,
    );
  }

  onTrace?.(`(unhandled tool ${call.name} — stub ok)`);
  return { stub: true, tool: call.name };
}

/**
 * @param {import('playwright').Page} page
 * @param {Array<{ callId: string, name: string, input: unknown }>} calls
 */
export async function executeNovaActCalls(page, calls, onTrace) {
  /** @type {Array<{ callId?: string, content: Array<{ text: string }> }>} */
  const results = [];
  for (const call of calls || []) {
    const id = call.callId;
    try {
      const ret = await executeNovaActCall(page, call, onTrace);
      results.push({
        callId: id,
        content: [{ text: JSON.stringify(ret) }],
      });
    } catch (e) {
      results.push({
        callId: id,
        content: [{ text: JSON.stringify({ error: e?.message || String(e) }) }],
      });
      throw e;
    }
  }
  return results;
}

/**
 * First InvokeActStep payload: initiateAct + takeObservation (see BurstBackend.step).
 */
export async function buildInitialCallResults(page, onTrace) {
  await settlePage(page);
  const obs = await takeObservation(page);
  return [
    { callId: 'initiateAct', content: [{ text: '{}' }] },
    { callId: 'takeObservation', content: [{ text: JSON.stringify(obs) }] },
  ];
}
