function $(id) {
  return document.getElementById(id);
}

function setStatus(msg, cls) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status ' + (cls || '');
}

function mapChromeCookie(c) {
  const o = {
    name: c.name,
    value: c.value || '',
    domain: c.domain || '',
    path: c.path || '/',
  };
  if (typeof c.secure === 'boolean') o.secure = c.secure;
  if (typeof c.httpOnly === 'boolean') o.httpOnly = c.httpOnly;
  if (c.expirationDate != null && !c.session) {
    o.expires = Math.floor(c.expirationDate);
  }
  const ss = c.sameSite;
  if (ss === 'no_restriction') o.sameSite = 'None';
  else if (ss === 'lax') o.sameSite = 'Lax';
  else if (ss === 'strict') o.sameSite = 'Strict';
  return o;
}

async function loadSettings() {
  const { apiUrl = '', apiKey = '' } = await chrome.storage.sync.get(['apiUrl', 'apiKey']);
  $('apiUrl').value = apiUrl;
  $('apiKey').value = apiKey;
}

async function saveSettings() {
  const apiUrl = $('apiUrl').value.trim().replace(/\/$/, '');
  const apiKey = $('apiKey').value.trim();
  await chrome.storage.sync.set({ apiUrl, apiKey });
  setStatus('Settings saved.', 'ok');
}

async function syncCookies() {
  setStatus('Reading tab…', 'info');
  const { apiUrl, apiKey } = await chrome.storage.sync.get(['apiUrl', 'apiKey']);
  if (!apiUrl || !apiKey) {
    setStatus('Set API URL and API key first, then Save.', 'err');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.url.startsWith('chrome://')) {
    setStatus('Open a normal https:// tab for the job site, then try again.', 'err');
    return;
  }

  let u;
  try {
    u = new URL(tab.url);
  } catch {
    setStatus('Invalid tab URL.', 'err');
    return;
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    setStatus('Use a http(s) page.', 'err');
    return;
  }

  const all = await chrome.cookies.getAll({ url: tab.url });
  if (!all.length) {
    setStatus('No cookies for this page. Log in on the site first.', 'err');
    return;
  }

  const cookies = all.map(mapChromeCookie);
  const endpoint = `${apiUrl.replace(/\/$/, '')}/api/session-capture/sync`;

  setStatus(`Sending ${cookies.length} cookie(s)…`, 'info');

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        cookies,
        hostname: u.hostname,
        source: 'extension',
      }),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      setStatus(`Error ${res.status}: ${data.error || text}`, 'err');
      return;
    }
    setStatus(
      `Synced ${data.mergedCount ?? cookies.length} cookie(s). Vault total: ${data.totalCount ?? '?'}. You can resume automation.`,
      'ok'
    );
  } catch (e) {
    setStatus(`Network error: ${e.message}. Check API URL and CORS (extensions bypass CORS for allowed hosts).`, 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  $('save').addEventListener('click', saveSettings);
  $('sync').addEventListener('click', syncCookies);
});
