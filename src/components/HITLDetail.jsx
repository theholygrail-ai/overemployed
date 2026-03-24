import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, buildApiPath, downloadSessionExtensionZip } from '../config.js';
import { useApi } from '../hooks/useApi';
import theme from '../theme';

const SCREENSHOT_POLL_MS = 2000;
/** Poll in-memory live viewport (Nova Act / Lambda) — same endpoint as Jobs table preview */
const LIVE_FRAME_POLL_MS = 800;
const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;

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
  const [typeText, setTypeText] = useState('');
  const [actionLog, setActionLog] = useState([]);
  const [sending, setSending] = useState(false);
  const [extensionDlBusy, setExtensionDlBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [screenshotBroken, setScreenshotBroken] = useState(false);
  /** Object URL from GET /jobs/:id/live-frame — live automation viewport (~1fps during HITL) */
  const [liveViewportUrl, setLiveViewportUrl] = useState(null);
  const imgRef = useRef(null);
  const viewportRef = useRef(null);

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

  useEffect(() => {
    const pending = blocker?.status === 'pending';
    const appId = blocker?.applicationId;
    if (!pending || !appId) {
      setLiveViewportUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return undefined;
    }

    let cancelled = false;

    async function pollLiveFrame() {
      try {
        const res = await apiFetch(`/jobs/${appId}/live-frame?t=${Date.now()}`);
        if (cancelled) return;
        if (res.status === 200) {
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setLiveViewportUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      } catch {
        /* offline or API unreachable */
      }
    }

    pollLiveFrame();
    const interval = setInterval(pollLiveFrame, LIVE_FRAME_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setLiveViewportUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [blocker?.applicationId, blocker?.status]);

  function addLog(msg) {
    setActionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }

  async function sendAction(action) {
    setSending(true);
    try {
      const res = await apiFetch(`/hitl/${id}/action`, {
        method: 'POST',
        body: JSON.stringify(action),
      });
      if (!res.ok) {
        const t = await res.text();
        addLog(`Error ${res.status}: ${t || res.statusText}`);
        return;
      }
      addLog(`${action.type}${action.x != null ? ` (${action.x},${action.y})` : ''}${action.text ? ` "${action.text}"` : ''}${action.key ? ` [${action.key}]` : ''}`);
      setTimeout(() => setScreenshotTs(Date.now()), 800);
    } catch (err) {
      addLog(`Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  function handleImageClick(e) {
    if (!viewportRef.current || blocker?.status !== 'pending') return;
    // Map clicks to the automation viewport (1280×800). Use the viewport wrapper, not the <img>,
    // so coordinates stay valid when the screenshot 404s and the image has no height.
    const rect = viewportRef.current.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const scaleX = VIEWPORT_W / rect.width;
    const scaleY = VIEWPORT_H / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    sendAction({ type: 'click', x, y });
  }

  function handleImageScroll(e) {
    if (blocker?.status !== 'pending') return;
    e.preventDefault();
    sendAction({ type: 'scroll', deltaY: e.deltaY });
  }

  function handleTypeSubmit() {
    if (!typeText.trim()) return;
    sendAction({ type: 'type', text: typeText });
    setTypeText('');
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
  const displaySrc = liveViewportUrl || screenshotUrl;
  const hasLiveViewport = Boolean(liveViewportUrl);
  const showViewportPlaceholder =
    !hasLiveViewport && (!blocker.hasScreenshot || screenshotBroken);
  const sessionSiteUrl = blocker.liveUrl || job?.jobLink || '';
  const siteHost = sessionHostname(sessionSiteUrl);
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
          <View style={styles.browserChrome}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.urlBar, { flex: 1 }]}>
                <Text style={styles.urlText} numberOfLines={1}>{blocker.liveUrl || '—'}</Text>
              </View>
              {hasLiveViewport && isPending && (
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>● Live</Text>
                </View>
              )}
            </View>
            {sending && <View style={styles.loadingBar} />}
          </View>

          <div
            ref={viewportRef}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: `${VIEWPORT_W} / ${VIEWPORT_H}`,
              cursor: isPending ? 'crosshair' : 'default',
              overflow: 'hidden',
              borderRadius: '0 0 10px 10px',
              background: '#111',
              minHeight: 120,
            }}
            onClick={handleImageClick}
            onWheel={handleImageScroll}
          >
            {showViewportPlaceholder && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  background: 'rgba(0,0,0,0.75)',
                  color: '#ccc',
                  fontSize: 13,
                  lineHeight: 1.45,
                  textAlign: 'center',
                }}
              >
                {screenshotBroken && !hasLiveViewport
                  ? 'Could not load static screenshot from API. Live viewport appears while the apply worker is running (same API as Jobs). Check BACKEND_URL / VITE_API_URL.'
                  : 'Waiting for live viewport from the Nova Act apply worker. If this persists, the worker may have exited — open Jobs to confirm status.'}
              </div>
            )}
            <img
              ref={imgRef}
              src={displaySrc}
              alt="Browser view"
              style={{
                width: '100%',
                display: 'block',
                userSelect: 'none',
                pointerEvents: 'none',
                opacity: showViewportPlaceholder ? 0 : 1,
              }}
              draggable={false}
              onLoad={() => {
                if (!hasLiveViewport) setScreenshotBroken(false);
              }}
              onError={() => {
                if (!hasLiveViewport) setScreenshotBroken(true);
              }}
            />
            {!isPending && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>
                  {blocker.status === 'resolved' ? 'Automation Resumed' : 'Intervention Ended'}
                </span>
              </div>
            )}
          </div>
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
                <Text style={styles.controlLabel}>Type text</Text>
                <View style={styles.typeRow}>
                  <TextInput
                    style={styles.typeInput}
                    value={typeText}
                    onChangeText={setTypeText}
                    placeholder="Type text and press Send..."
                    placeholderTextColor={theme.colors.textMuted}
                    onSubmitEditing={handleTypeSubmit}
                  />
                  <TouchableOpacity style={styles.sendBtn} onPress={handleTypeSubmit}>
                    <Text style={styles.sendBtnText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.controlSection}>
                <Text style={styles.controlLabel}>Key press</Text>
                <View style={styles.keyRow}>
                  {['Enter', 'Tab', 'Escape', 'Backspace'].map(key => (
                    <TouchableOpacity key={key} style={styles.keyBtn} onPress={() => sendAction({ type: 'press', key })}>
                      <Text style={styles.keyBtnText}>{key}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.controlSection}>
                <Text style={styles.controlLabel}>Scroll</Text>
                <View style={styles.keyRow}>
                  <TouchableOpacity style={styles.keyBtn} onPress={() => sendAction({ type: 'scroll', deltaY: -300 })}>
                    <Text style={styles.keyBtnText}>↑ Up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.keyBtn} onPress={() => sendAction({ type: 'scroll', deltaY: 300 })}>
                    <Text style={styles.keyBtnText}>↓ Down</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.controlSection}>
                <TouchableOpacity style={styles.keyBtn} onPress={() => sendAction({ type: 'clear' })}>
                  <Text style={styles.keyBtnText}>Clear Field</Text>
                </TouchableOpacity>
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
                <Text style={styles.logEmpty}>Click on the browser, type text, or press keys to interact.</Text>
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
