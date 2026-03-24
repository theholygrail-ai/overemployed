import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import theme from '../theme';
import { apiFetch, downloadSessionExtensionZip } from '../config.js';

function useLocalStorage(key, defaultValue = '') {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) || defaultValue; } catch { return defaultValue; }
  });
  const save = (v) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* noop */ }
  };
  return [value, save];
}

export default function Settings() {
  const [groqKey, setGroqKey] = useLocalStorage('groq_api_key');
  const [adzunaId, setAdzunaId] = useLocalStorage('adzuna_app_id');
  const [adzunaKey, setAdzunaKey] = useLocalStorage('adzuna_app_key');
  const [keywords, setKeywords] = useLocalStorage('search_keywords');
  const [location, setLocation] = useLocalStorage('search_location');
  const [filters, setFilters] = useLocalStorage('search_filters');
  const [showGroq, setShowGroq] = useState(false);
  const [showAdzKey, setShowAdzKey] = useState(false);
  const [showLiCookie, setShowLiCookie] = useState(false);
  const [liCookie, setLiCookie] = useState('');
  const [liSaved, setLiSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkedIn, setLinkedIn] = useState({ connected: false });

  const [sessionCookieJson, setSessionCookieJson] = useState('');
  const [sessionDefaultDomain, setSessionDefaultDomain] = useState('.adzuna.com');
  const [sessionMeta, setSessionMeta] = useState({ configured: false, cookieCount: 0, updatedAt: null });
  const [sessionSaved, setSessionSaved] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [extractRaw, setExtractRaw] = useState('');
  const [extractDomainHint, setExtractDomainHint] = useState('.linkedin.com');
  const [extractSiteHint, setExtractSiteHint] = useState('linkedin.com job apply');
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractNotes, setExtractNotes] = useState('');
  const [pendingLiAt, setPendingLiAt] = useState('');
  const [extensionDlBusy, setExtensionDlBusy] = useState(false);

  const [applyCredsJson, setApplyCredsJson] = useState('{\n  "linkedin.com": { "username": "", "password": "" }\n}');
  const [applyCredsMeta, setApplyCredsMeta] = useState({ configured: false, hosts: [] });
  const [applyCredsSaved, setApplyCredsSaved] = useState(false);
  const [applyCredsError, setApplyCredsError] = useState('');

  useEffect(() => {
    apiFetch('/auth/linkedin/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setLinkedIn(data);
          if (data.hasCookie) setLiCookie('••••••••••••');
        }
      })
      .catch(() => {});

    apiFetch('/settings/session-cookies')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setSessionMeta(data);
      })
      .catch(() => {});

    apiFetch('/settings/apply-credentials')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setApplyCredsMeta({ configured: data.configured, hosts: data.hosts || [] });
      })
      .catch(() => {});
  }, []);

  const handleSaveLiCookie = async () => {
    if (!liCookie || liCookie === '••••••••••••') return;
    try {
      const res = await apiFetch('/auth/linkedin/cookie', {
        method: 'POST',
        body: JSON.stringify({ cookie: liCookie }),
      });
      if (res.ok) {
        setLiSaved(true);
        setLinkedIn(prev => ({ ...prev, connected: true, hasCookie: true }));
        setLiCookie('••••••••••••');
        setTimeout(() => setLiSaved(false), 2000);
      }
    } catch {}
  };

  const handleDisconnectLinkedIn = async () => {
    await apiFetch('/auth/linkedin', { method: 'DELETE' });
    setLinkedIn({ connected: false });
    setLiCookie('');
    setLiSaved(false);
  };

  const handleSaveSessionCookies = async () => {
    setSessionError('');
    const raw = sessionCookieJson.trim();
    if (!raw) {
      setSessionError('Paste a JSON array or Cookie header string first.');
      return;
    }
    try {
      let body;
      if (raw.startsWith('[')) {
        body = { cookies: raw };
      } else {
        if (!sessionDefaultDomain.trim()) {
          setSessionError('Set Default domain (e.g. .adzuna.com) for Cookie header format.');
          return;
        }
        body = { cookies: raw, defaultDomain: sessionDefaultDomain.trim() };
      }
      const res = await apiFetch('/settings/session-cookies', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSessionError(data.error || res.statusText);
        return;
      }
      setSessionMeta({
        configured: true,
        cookieCount: data.cookieCount ?? 0,
        updatedAt: data.updatedAt,
      });
      setSessionSaved(true);
      setSessionCookieJson('');
      setTimeout(() => setSessionSaved(false), 2500);
    } catch (e) {
      setSessionError(e.message || 'Save failed');
    }
  };

  const handleExtractSessionCookies = async () => {
    setExtractError('');
    setExtractNotes('');
    const raw = extractRaw.trim();
    if (!raw) {
      setExtractError('Paste DevTools / Network JSON or cookie export first.');
      return;
    }
    setExtractLoading(true);
    try {
      const res = await apiFetch('/settings/session-cookies/extract', {
        method: 'POST',
        body: JSON.stringify({
          raw,
          defaultDomainHint: extractDomainHint.trim() || undefined,
          siteHint: extractSiteHint.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExtractError(data.error || res.statusText);
        return;
      }
      if (data.cookiesJson) {
        setSessionCookieJson(data.cookiesJson);
      }
      setPendingLiAt(data.liAtSuggestion || '');
      setExtractNotes(data.notes || '');
    } catch (e) {
      setExtractError(e.message || 'Extract failed');
    } finally {
      setExtractLoading(false);
    }
  };

  const handleApplyLiAtSuggestion = () => {
    if (!pendingLiAt) return;
    setLiCookie(pendingLiAt);
    setShowLiCookie(false);
  };

  const handleClearSessionCookies = async () => {
    setSessionError('');
    try {
      const res = await apiFetch('/settings/session-cookies', { method: 'DELETE' });
      if (res.ok) {
        setSessionMeta({ configured: false, cookieCount: 0, updatedAt: null });
        setSessionCookieJson('');
      }
    } catch (e) {
      setSessionError(e.message || 'Clear failed');
    }
  };

  const handleSaveApplyCredentials = async () => {
    setApplyCredsError('');
    try {
      const parsed = JSON.parse(applyCredsJson.trim() || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setApplyCredsError('Root must be a JSON object keyed by hostname.');
        return;
      }
      const res = await apiFetch('/settings/apply-credentials', {
        method: 'POST',
        body: JSON.stringify({ sites: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApplyCredsError(data.error || res.statusText);
        return;
      }
      setApplyCredsMeta({
        configured: (data.hostCount || 0) > 0,
        hosts: Object.keys(parsed),
      });
      setApplyCredsSaved(true);
      setTimeout(() => setApplyCredsSaved(false), 2500);
    } catch (e) {
      setApplyCredsError(e.message || 'Invalid JSON or save failed');
    }
  };

  const handleClearApplyCredentials = async () => {
    setApplyCredsError('');
    try {
      const res = await apiFetch('/settings/apply-credentials', { method: 'DELETE' });
      if (res.ok) {
        setApplyCredsMeta({ configured: false, hosts: [] });
      }
    } catch (e) {
      setApplyCredsError(e.message || 'Clear failed');
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.subheading}>API keys and search configuration</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Groq API Key</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={groqKey}
            onChangeText={setGroqKey}
            placeholder="gsk_..."
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showGroq}
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowGroq(!showGroq)}>
            <Text style={styles.toggleBtnText}>{showGroq ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Adzuna Credentials</Text>
        <Text style={styles.label}>App ID</Text>
        <TextInput
          style={styles.input}
          value={adzunaId}
          onChangeText={setAdzunaId}
          placeholder="Your Adzuna App ID"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>App Key</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={adzunaKey}
            onChangeText={setAdzunaKey}
            placeholder="Your Adzuna App Key"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showAdzKey}
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowAdzKey(!showAdzKey)}>
            <Text style={styles.toggleBtnText}>{showAdzKey ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>LinkedIn Session</Text>
        <View style={[styles.linkedInRow, { marginBottom: theme.spacing.sm }]}>
          <View style={[styles.statusDot, { backgroundColor: linkedIn.connected ? theme.colors.success : theme.colors.textMuted }]} />
          <Text style={styles.linkedInStatus}>
            {linkedIn.connected ? 'Connected (cookie set)' : 'Not connected'}
          </Text>
          {linkedIn.connected && (
            <TouchableOpacity style={[styles.toggleBtn, { borderColor: theme.colors.error }]} onPress={handleDisconnectLinkedIn}>
              <Text style={[styles.toggleBtnText, { color: theme.colors.error }]}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.label}>li_at Cookie (from browser DevTools &gt; Application &gt; Cookies &gt; linkedin.com)</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1, fontFamily: 'monospace', fontSize: theme.fonts.xs }]}
            value={liCookie}
            onChangeText={setLiCookie}
            placeholder="AQEFAHQBAAAAABs3kXg..."
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showLiCookie}
            onFocus={() => { if (liCookie === '••••••••••••') setLiCookie(''); }}
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowLiCookie(!showLiCookie)}>
            <Text style={styles.toggleBtnText}>{showLiCookie ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.connectBtn, { marginTop: theme.spacing.sm, alignSelf: 'flex-start' }]}
          onPress={handleSaveLiCookie}
        >
          <Text style={styles.connectBtnText}>{liSaved ? '✓ Saved' : 'Save Cookie'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Automation session cookies</Text>
        <View style={styles.extensionBanner}>
          <Text style={styles.extensionBannerTitle}>Recommended: Session Helper (Chrome)</Text>
          <Text style={styles.helpText}>
            Install the extension, enter your API base URL and the same API key as <Text style={{ fontWeight: '700' }}>VITE_API_KEY</Text>, then
            open any job site, log in, and click <Text style={{ fontWeight: '700' }}>Sync cookies from active tab</Text>. No Network-tab JSON paste.
          </Text>
          <TouchableOpacity
            style={[styles.extensionDlBtn, extensionDlBusy && { opacity: 0.7 }]}
            disabled={extensionDlBusy}
            onPress={async () => {
              setExtensionDlBusy(true);
              try {
                await downloadSessionExtensionZip();
              } catch (e) {
                window.alert(
                  `Could not download the extension zip.\n${e?.message || e}\n\nDev: run npm run package:extension then refresh.`
                );
              } finally {
                setExtensionDlBusy(false);
              }
            }}
          >
            <Text style={styles.extensionDlBtnText}>
              {extensionDlBusy ? 'Preparing download…' : '⬇ Download Session Helper (.zip)'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helpText}>
          Stored in the cloud with your other settings. Applied automatically before each apply run (Adzuna, Google
          sign-in, ATS sites). If automation hits a login wall, refresh the LinkedIn <Text style={{ fontWeight: '700' }}>li_at</Text> cookie
          and these session cookies — they expire.
        </Text>

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>AI extract (Groq GPT-OSS 120B)</Text>
        <Text style={styles.helpText}>
          Paste anything from the Network tab (request/response JSON), Application → Cookies export, or HAR fragment.
          The server calls Groq to return a clean JSON cookie array you can review and save below — no manual field
          picking.
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 100, fontFamily: 'monospace', fontSize: theme.fonts.xs, marginTop: theme.spacing.xs }]}
          value={extractRaw}
          onChangeText={setExtractRaw}
          placeholder="Paste raw JSON / headers / export here…"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Domain hint (helps Cookie-header style pastes)</Text>
        <TextInput
          style={[styles.input, { fontFamily: 'monospace', fontSize: theme.fonts.xs }]}
          value={extractDomainHint}
          onChangeText={setExtractDomainHint}
          placeholder=".linkedin.com"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Site hint (optional)</Text>
        <TextInput
          style={styles.input}
          value={extractSiteHint}
          onChangeText={setExtractSiteHint}
          placeholder="e.g. LinkedIn Easy Apply"
          placeholderTextColor={theme.colors.textMuted}
        />
        {extractError ? <Text style={styles.errorText}>{extractError}</Text> : null}
        {extractNotes ? (
          <Text style={[styles.helpText, { marginTop: theme.spacing.sm, color: theme.colors.textSecondary }]}>
            {extractNotes}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
          <TouchableOpacity
            style={[styles.connectBtn, { backgroundColor: theme.colors.primary, opacity: extractLoading ? 0.6 : 1 }]}
            onPress={handleExtractSessionCookies}
            disabled={extractLoading}
          >
            <Text style={styles.connectBtnText}>
              {extractLoading ? 'Extracting…' : 'Extract session cookies with Groq'}
            </Text>
          </TouchableOpacity>
          {pendingLiAt ? (
            <TouchableOpacity style={[styles.toggleBtn, { borderColor: theme.colors.primary }]} onPress={handleApplyLiAtSuggestion}>
              <Text style={[styles.toggleBtnText, { color: theme.colors.primary }]}>Apply li_at to field above</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.linkedInRow, { marginBottom: theme.spacing.sm }]}>
          <View style={[styles.statusDot, { backgroundColor: sessionMeta.configured ? theme.colors.success : theme.colors.textMuted }]} />
          <Text style={styles.linkedInStatus}>
            {sessionMeta.configured
              ? `${sessionMeta.cookieCount} cookie(s) saved${sessionMeta.updatedAt ? ` · updated ${new Date(sessionMeta.updatedAt).toLocaleString()}` : ''}`
              : 'No session cookies saved'}
          </Text>
          {sessionMeta.configured && (
            <TouchableOpacity style={[styles.toggleBtn, { borderColor: theme.colors.error }]} onPress={handleClearSessionCookies}>
              <Text style={[styles.toggleBtnText, { color: theme.colors.error }]}>Revoke</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.label}>How to get cookies (Chrome / Edge)</Text>
        <Text style={styles.helpText}>
          1. Open the job site while logged in (e.g. Adzuna or after Google sign-in).{'\n'}
          2. F12 → Application → Cookies → select the site (e.g. https://www.adzuna.com).{'\n'}
          3. Copy each cookie’s Name, Value, and Domain into the JSON below, OR copy the request Cookie header from
          Network tab and use “Default domain” + semicolon format.{'\n'}
          4. For Google flows, also add cookies for accounts.google.com / .google.com if needed.
        </Text>
        <Text style={styles.label}>JSON array (recommended)</Text>
        <Text style={styles.monoHint}>
          [&#123; &quot;name&quot;: &quot;…&quot;, &quot;value&quot;: &quot;…&quot;, &quot;domain&quot;: &quot;.adzuna.com&quot;, &quot;path&quot;: &quot;/&quot; &#125;, …]
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 140, fontFamily: 'monospace', fontSize: theme.fonts.xs, marginTop: theme.spacing.xs }]}
          value={sessionCookieJson}
          onChangeText={setSessionCookieJson}
          placeholder={`[\n  { "name": "session", "value": "…", "domain": ".adzuna.com", "path": "/" }\n]`}
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Default domain (only for Cookie header format)</Text>
        <TextInput
          style={[styles.input, { fontFamily: 'monospace', fontSize: theme.fonts.xs }]}
          value={sessionDefaultDomain}
          onChangeText={setSessionDefaultDomain}
          placeholder=".adzuna.com"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Text style={[styles.helpText, { marginTop: theme.spacing.xs }]}>
          If you paste a raw header like a=b; c=d (not JSON), set the domain for those pairs (e.g. .adzuna.com).
        </Text>
        {sessionError ? <Text style={styles.errorText}>{sessionError}</Text> : null}
        <TouchableOpacity
          style={[styles.connectBtn, { marginTop: theme.spacing.sm, alignSelf: 'flex-start', backgroundColor: theme.colors.primary }]}
          onPress={handleSaveSessionCookies}
        >
          <Text style={styles.connectBtnText}>{sessionSaved ? '✓ Saved' : 'Save session cookies'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nova Act — site passwords (optional)</Text>
        <Text style={styles.helpText}>
          For local apply via WSL, the planner may ask Nova Act to log in. Passwords are typed via Playwright (not sent
          in LLM prompts). Prefer session cookies + Session Helper when possible. Stored with your operator memory on the API server — use{' '}
          <Text style={{ fontWeight: '700' }}>API_KEY</Text> in production.
        </Text>
        <View style={[styles.linkedInRow, { marginBottom: theme.spacing.sm }]}>
          <View style={[styles.statusDot, { backgroundColor: applyCredsMeta.configured ? theme.colors.success : theme.colors.textMuted }]} />
          <Text style={styles.linkedInStatus}>
            {applyCredsMeta.configured
              ? `Hosts: ${(applyCredsMeta.hosts || []).join(', ') || 'configured'}`
              : 'No saved credentials'}
          </Text>
          {applyCredsMeta.configured && (
            <TouchableOpacity style={[styles.toggleBtn, { borderColor: theme.colors.error }]} onPress={handleClearApplyCredentials}>
              <Text style={[styles.toggleBtnText, { color: theme.colors.error }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.monoHint}>
          &#123; &quot;linkedin.com&quot;: &#123; &quot;username&quot;: &quot;you@email.com&quot;, &quot;password&quot;: &quot;…&quot; &#125; &#125;
        </Text>
        <TextInput
          style={[styles.input, { minHeight: 120, fontFamily: 'monospace', fontSize: theme.fonts.xs, marginTop: theme.spacing.xs }]}
          value={applyCredsJson}
          onChangeText={setApplyCredsJson}
          placeholder='{ "linkedin.com": { "username": "", "password": "" } }'
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
        {applyCredsError ? <Text style={styles.errorText}>{applyCredsError}</Text> : null}
        <TouchableOpacity
          style={[styles.connectBtn, { marginTop: theme.spacing.sm, alignSelf: 'flex-start', backgroundColor: theme.colors.primary }]}
          onPress={handleSaveApplyCredentials}
        >
          <Text style={styles.connectBtnText}>{applyCredsSaved ? '✓ Saved' : 'Save site credentials'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Job Search Criteria</Text>

        <Text style={styles.label}>Keywords (comma-separated)</Text>
        <TextInput
          style={styles.input}
          value={keywords}
          onChangeText={setKeywords}
          placeholder="React, Node.js, Full Stack, Senior Developer"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Remote, US, New York"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Filters</Text>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          value={filters}
          onChangeText={setFilters}
          placeholder="e.g. salary_min=100000, remote=true"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40, maxWidth: 600 },
  heading: {
    fontSize: theme.fonts.xxl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subheading: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
    marginTop: 2,
    marginBottom: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fonts.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
    fontWeight: '500',
  },
  input: {
    backgroundColor: theme.colors.surfaceHover,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fonts.md,
    outlineColor: theme.colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  toggleBtn: {
    backgroundColor: theme.colors.surfaceHover,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtnText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  linkedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  linkedInStatus: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    flex: 1,
  },
  connectBtn: {
    backgroundColor: '#0a66c2',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  connectBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.sm,
  },
  helpText: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: theme.spacing.sm,
  },
  monoHint: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
    marginBottom: theme.spacing.xs,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fonts.xs,
    marginTop: theme.spacing.xs,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.md,
  },
  extensionBanner: {
    backgroundColor: theme.colors.primary + '12',
    borderWidth: 1,
    borderColor: theme.colors.primary + '44',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  extensionBannerTitle: {
    fontSize: theme.fonts.sm,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  extensionDlBtn: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  extensionDlBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: theme.fonts.xs,
  },
});
