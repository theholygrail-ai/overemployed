import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, buildApiPath, downloadSessionExtensionZip } from '../config.js';
import { useApi } from '../hooks/useApi';
import theme from '../theme';
import NovaActPlaygroundPanel from './NovaActPlaygroundPanel.jsx';

const SCREENSHOT_POLL_MS = 2000;

function sessionHostname(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default function HITLDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const [blocker, setBlocker] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screenshotTs, setScreenshotTs] = useState(Date.now());
  const [actionLog, setActionLog] = useState([]);
  const [extensionDlBusy, setExtensionDlBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [screenshotBroken, setScreenshotBroken] = useState(false);

  useEffect(() => {
    setScreenshotBroken(false);
  }, [id]);

  const fetchBlocker = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await apiFetch(`/hitl/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBlocker(data);
        if (data.status !== 'pending') {
          addLog(`Blocker ${data.status}`);
        }
      } else {
        const t = await res.text();
        setLoadError(t || `HTTP ${res.status}`);
        setBlocker(null);
      }
    } catch (e) {
      setLoadError(e?.message || 'Failed to load intervention');
      setBlocker(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBlocker();
    const interval = setInterval(fetchBlocker, 5000);
    return () => clearInterval(interval);
  }, [fetchBlocker]);

  useEffect(() => {
    if (!blocker?.applicationId) {
      setJob(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await api.get(`/jobs/${blocker.applicationId}`);
      if (!cancelled && data) setJob(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [blocker?.applicationId]);

  useEffect(() => {
    if (!blocker || blocker.status !== 'pending') return;
    const interval = setInterval(() => setScreenshotTs(Date.now()), SCREENSHOT_POLL_MS);
    return () => clearInterval(interval);
  }, [blocker]);

  function addLog(msg) {
    setActionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }

  async function handleProceed() {
    try {
      const res = await apiFetch(`/hitl/${id}/resume`, { method: 'POST' });
      if (!res.ok) {
        const t = await res.text();
        addLog(`Proceed error ${res.status}: ${t || res.statusText}`);
        return;
      }
      addLog('Proceed — automation resuming');
      fetchBlocker();
    } catch (err) {
      addLog(`Proceed error: ${err.message}`);
    }
  }

  async function handleSkip() {
    try {
      const res = await apiFetch(`/hitl/${id}/skip`, { method: 'POST' });
      if (!res.ok) {
        const t = await res.text();
        addLog(`Skip error ${res.status}: ${t || res.statusText}`);
        return;
      }
      addLog('Skipped');
      fetchBlocker();
    } catch (err) {
      addLog(`Skip error: ${err.message}`);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!blocker) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{loadError || 'Blocker not found'}</Text>
        <Text style={[styles.emptyText, { fontSize: theme.fonts.sm, marginTop: 8 }]}>
          If you use Vercel, ensure /api/hitl/* is proxied (BACKEND_URL) and the blocker id in the URL matches the API.
        </Text>
        <TouchableOpacity onPress={() => navigate('/interventions')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back to Interventions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPending = blocker.status === 'pending';
  const screenshotUrl = `${buildApiPath(`/hitl/${id}/screenshot`)}?t=${screenshotTs}`;
  const displaySrc = screenshotUrl;
  const showViewportPlaceholder = !blocker.hasScreenshot || screenshotBroken;
  const sessionSiteUrl = blocker.liveUrl || job?.jobLink || '';
  const siteHost = sessionHostname(sessionSiteUrl);
  const [runConsoleUrl, setRunConsoleUrl] = useState(null);
  useEffect(() => {
    const appId = blocker?.applicationId;
    if (!appId || blocker?.status !== 'pending') {
      setRunConsoleUrl(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const mRes = await apiFetch(`/jobs/${appId}/nova-act/run-meta?t=${Date.now()}`);
        if (cancelled || !mRes.ok) return;
        const meta = await mRes.json();
        if (meta?.consoleUrl) setRunConsoleUrl(meta.consoleUrl);
      } catch {
        /* ignore */
      }
    })();
    const id = setInterval(async () => {
      try {
        const mRes = await apiFetch(`/jobs/${appId}/nova-act/run-meta?t=${Date.now()}`);
        if (!mRes.ok) return;
        const meta = await mRes.json();
        if (meta?.consoleUrl) setRunConsoleUrl(meta.consoleUrl);
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [blocker?.applicationId, blocker?.status]);

  const consoleOpenUrl = blocker.consoleUrl || runConsoleUrl;
  const handleDownloadExtension = async () => {
    setExtensionDlBusy(true);
    try {
      await downloadSessionExtensionZip();
    } catch (e) {
      window.alert(
        `Could not download the extension zip.\n${e?.message || e}\n\nRun: npm run package:extension\nOr open your API: …/api/session-capture/extension.zip`
      );
    } finally {
      setExtensionDlBusy(false);
    }
  };

  const openSessionSite = () => {
    if (sessionSiteUrl) window.open(sessionSiteUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigate('/interventions')} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Interventions</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.heading}>Browser Intervention</Text>
          <Text style={styles.reasonPreview} numberOfLines={2}>
            {blocker.reason || '—'}
          </Text>
          <ScrollView style={styles.reasonScroll} nestedScrollEnabled>
            <Text style={styles.reasonFull}>{blocker.reason}</Text>
          </ScrollView>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isPending ? theme.colors.warning + '22' : theme.colors.success + '22' }]}>
          <Text style={[styles.statusText, { color: isPending ? theme.colors.warning : theme.colors.success }]}>
            {isPending ? 'Waiting for input' : blocker.status}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.browserPane}>
          {isPending && blocker.applicationId ? (
            <NovaActPlaygroundPanel
              applicationId={blocker.applicationId}
              jobPostingUrl={job?.jobLink || ''}
              consoleUrl={consoleOpenUrl}
              fallbackImageUrl={blocker.hasScreenshot && !showViewportPlaceholder ? displaySrc : null}
            />
          ) : (
            <View>
              <Text style={styles.sessionTitle}>Intervention ended</Text>
              <Text style={styles.sessionBody}>Open the job from Jobs to start a new apply if needed.</Text>
            </View>
          )}
        </View>

        <View style={styles.controlPane}>
          <Text style={styles.controlHeading}>Controls</Text>

          {isPending && (
            <>
              <View style={styles.sessionCard}>
                <Text style={styles.sessionTitle}>Session & cookies</Text>
                <Text style={styles.sessionBody}>
                  If this site blocked automation (login, CAPTCHA, or wrong domain cookies), use the Session Helper: log in
                  in a normal Chrome tab, then sync cookies to the server — no DevTools paste.
                </Text>
                {siteHost ? (
                  <Text style={styles.sessionHost}>Target site: <Text style={styles.sessionHostMono}>{siteHost}</Text></Text>
                ) : (
                  <Text style={styles.sessionHint}>No URL on file — use the browser view URL or open the job from Jobs.</Text>
                )}
                <View style={styles.sessionRow}>
                  <TouchableOpacity
                    style={[styles.sessionBtnSecondary, extensionDlBusy && { opacity: 0.6 }]}
                    onPress={handleDownloadExtension}
                    disabled={extensionDlBusy}
                  >
                    <Text style={styles.sessionBtnSecondaryText}>
                      {extensionDlBusy ? 'Preparing download…' : '⬇ Download Session Helper (.zip)'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sessionSteps}>
                  1) Unzip → Chrome → Extensions → Developer mode → Load unpacked.{'\n'}
                  2) Click the extension icon → set API URL + API key (same as Settings / VITE_API_KEY) → Save.{'\n'}
                  3) Open the job site below, log in manually.{'\n'}
                  4) Click &quot;Sync cookies from active tab&quot; in the extension.{'\n'}
                  5) Return here and tap Proceed.
                </Text>
                <TouchableOpacity style={styles.sessionBtnPrimary} onPress={openSessionSite} disabled={!sessionSiteUrl}>
                  <Text style={[styles.sessionBtnPrimaryText, !sessionSiteUrl && styles.sessionBtnDisabled]}>
                    Open job site in new tab
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.controlSection}>
                <Text style={styles.sessionBody}>
                  Remote click/type into the automation browser is disabled for AWS Nova Act IAM runs. Complete CAPTCHA or login in your own browser (session helper below), use the AWS console for the managed session, then tap Proceed.
                </Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed}>
                  <Text style={styles.proceedBtnText}>Proceed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {!isPending && (
            <View style={styles.controlSection}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigate('/interventions')}>
                <Text style={styles.backBtnText}>Back to Interventions</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.logSection}>
            <Text style={styles.controlLabel}>Action Log</Text>
            <View style={styles.logBox}>
              {actionLog.length === 0 ? (
                <Text style={styles.logEmpty}>Proceed / Skip actions are logged here.</Text>
              ) : (
                actionLog.map((msg, i) => (
                  <Text key={i} style={styles.logLine}>{msg}</Text>
                ))
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: theme.colors.textMuted, fontSize: theme.fonts.lg, marginBottom: theme.spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
  },
  backLink: { padding: theme.spacing.xs },
  backLinkText: { color: theme.colors.primary, fontSize: theme.fonts.sm },
  headerInfo: { flex: 1, minWidth: 0 },
  heading: { fontSize: theme.fonts.xl, fontWeight: '700', color: theme.colors.text },
  reasonPreview: { fontSize: theme.fonts.sm, color: theme.colors.textSecondary, marginTop: 4, fontWeight: '600' },
  reasonScroll: { maxHeight: 100, marginTop: 6 },
  reasonFull: { fontSize: theme.fonts.xs, color: theme.colors.textMuted, lineHeight: 18 },
  statusBadge: { borderRadius: theme.borderRadius.sm, paddingHorizontal: 12, paddingVertical: 4 },
  statusText: { fontSize: theme.fonts.sm, fontWeight: '600' },
  body: { flexDirection: 'row', flex: 1, gap: theme.spacing.md },
  browserPane: {
    flex: 3,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  browserChrome: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  urlBar: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  urlText: { color: theme.colors.textMuted, fontSize: theme.fonts.xs, fontFamily: 'monospace' },
  liveBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveBadgeText: { color: '#4ade80', fontSize: theme.fonts.xs, fontWeight: '700' },
  loadingBar: {
    height: 2,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  controlPane: {
    flex: 1,
    minWidth: 260,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  controlHeading: { fontSize: theme.fonts.lg, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.md },
  controlSection: { marginBottom: theme.spacing.md },
  controlLabel: { fontSize: theme.fonts.sm, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, fontWeight: '600' },
  typeRow: { flexDirection: 'row', gap: theme.spacing.xs },
  typeInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    fontSize: theme.fonts.sm,
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: theme.fonts.sm },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  keyBtn: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  keyBtnText: { color: theme.colors.text, fontSize: theme.fonts.xs, fontFamily: 'monospace' },
  actionButtons: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  proceedBtn: {
    flex: 1,
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  proceedBtnText: { color: '#fff', fontWeight: '700', fontSize: theme.fonts.md },
  skipBtn: {
    flex: 1,
    backgroundColor: theme.colors.error + '22',
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.error,
    paddingVertical: 10,
    alignItems: 'center',
  },
  skipBtnText: { color: theme.colors.error, fontWeight: '600', fontSize: theme.fonts.md },
  backBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  backBtnText: { color: '#fff', fontWeight: '600', fontSize: theme.fonts.md },
  logSection: { flex: 1 },
  logBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    maxHeight: 200,
    overflow: 'hidden',
  },
  logEmpty: { color: theme.colors.textMuted, fontSize: theme.fonts.xs, fontStyle: 'italic' },
  logLine: { color: theme.colors.textSecondary, fontSize: theme.fonts.xs, fontFamily: 'monospace', marginBottom: 2 },
  sessionCard: {
    backgroundColor: theme.colors.primary + '10',
    borderWidth: 1,
    borderColor: theme.colors.primary + '44',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sessionTitle: { fontSize: theme.fonts.md, fontWeight: '700', color: theme.colors.primary, marginBottom: theme.spacing.xs },
  sessionBody: { fontSize: theme.fonts.xs, color: theme.colors.textSecondary, lineHeight: 18, marginBottom: theme.spacing.sm },
  sessionHost: { fontSize: theme.fonts.xs, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  sessionHostMono: { fontFamily: 'monospace', color: theme.colors.text, fontWeight: '600' },
  sessionHint: { fontSize: theme.fonts.xs, color: theme.colors.warning, marginBottom: theme.spacing.sm },
  sessionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  sessionBtnSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary + '55',
    paddingVertical: 8,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
  },
  sessionBtnSecondaryText: { color: theme.colors.primary, fontWeight: '600', fontSize: theme.fonts.xs },
  sessionSteps: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 17,
    marginBottom: theme.spacing.sm,
    whiteSpace: 'pre-line',
  },
  sessionBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sessionBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: theme.fonts.sm },
  sessionBtnDisabled: { opacity: 0.5 },
});
