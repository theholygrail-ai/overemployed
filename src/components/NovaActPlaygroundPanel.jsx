import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { apiFetch, buildApiPath } from '../config.js';
import theme from '../theme';
import { splitNovaActTraceLines } from '../utils/novaActTrace.js';

const FRAME_POLL_MS = 750;
const TRACE_POLL_MS = 1100;
const META_POLL_MS = 900;
const RUN_META_POLL_MS = 2000;

/**
 * Nova Act Playground–style monitor: live local Playwright viewport + task + reasoning / activity panes.
 * The AWS control plane does not stream video; the image is our automation browser on the API server.
 */
export default function NovaActPlaygroundPanel({
  applicationId,
  jobPostingUrl = '',
  consoleUrl = null,
  /** Optional HITL static screenshot URL when live frame is not yet available */
  fallbackImageUrl = null,
  showTaskAndNotes = true,
  compact = false,
}) {
  const [frameTs, setFrameTs] = useState(0);
  const [pageUrl, setPageUrl] = useState('');
  const [hasFrame, setHasFrame] = useState(false);
  const [traceLines, setTraceLines] = useState([]);
  const [taskText, setTaskText] = useState('');
  const [operatorNote, setOperatorNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteMsg, setNoteMsg] = useState('');
  const [frameBroken, setFrameBroken] = useState(false);
  /** MJPEG from Chromium CDP; falls back to polled single-frame if stream fails (proxy/auth). */
  const [streamFailed, setStreamFailed] = useState(false);
  /** Browserbase runs in a remote session — same host MJPEG is still fed by server-side PNG ticks, but we surface the dashboard link. */
  const [browserbaseSessionId, setBrowserbaseSessionId] = useState(null);
  const [browserbaseConsoleUrl, setBrowserbaseConsoleUrl] = useState(null);

  const streamUrl = useMemo(
    () => (applicationId ? buildApiPath(`/jobs/${applicationId}/nova-act/live-stream`) : ''),
    [applicationId],
  );

  const liveFrameSrc = useMemo(() => {
    if (!applicationId) return '';
    return `${buildApiPath(`/jobs/${applicationId}/nova-act/live-frame`)}?t=${frameTs}`;
  }, [applicationId, frameTs]);

  const { thinking, activity } = useMemo(() => splitNovaActTraceLines(traceLines), [traceLines]);

  const pollMeta = useCallback(async () => {
    if (!applicationId) return;
    try {
      const res = await apiFetch(`/jobs/${applicationId}/nova-act/live-meta?t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      setHasFrame(Boolean(data?.hasFrame));
      if (data?.pageUrl) setPageUrl(data.pageUrl);
    } catch {
      /* ignore */
    }
  }, [applicationId]);

  const pollRunMeta = useCallback(async () => {
    if (!applicationId) return;
    try {
      const res = await apiFetch(`/jobs/${applicationId}/nova-act/run-meta?t=${Date.now()}`);
      if (!res.ok) {
        if (res.status === 404) {
          setBrowserbaseSessionId(null);
          setBrowserbaseConsoleUrl(null);
        }
        return;
      }
      const data = await res.json();
      setBrowserbaseSessionId(data?.browserbaseSessionId || null);
      setBrowserbaseConsoleUrl(data?.consoleUrl || null);
    } catch {
      /* ignore */
    }
  }, [applicationId]);

  const pollTrace = useCallback(async () => {
    if (!applicationId) return;
    try {
      const res = await apiFetch(`/jobs/${applicationId}/nova-act/trace?t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      const lines = Array.isArray(data?.lines) ? data.lines : [];
      setTraceLines(lines);
    } catch {
      /* ignore */
    }
  }, [applicationId]);

  const loadTask = useCallback(async () => {
    if (!applicationId || !showTaskAndNotes) return;
    try {
      const res = await apiFetch(`/jobs/${applicationId}/nova-act/task-preview?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setTaskText(data?.text || '');
      }
    } catch {
      /* ignore */
    }
  }, [applicationId, showTaskAndNotes]);

  useEffect(() => {
    if (!applicationId) return undefined;
    setFrameBroken(false);
    setStreamFailed(false);
    loadTask();
    const t2 = setInterval(pollTrace, TRACE_POLL_MS);
    const t3 = setInterval(pollMeta, META_POLL_MS);
    const t4 = setInterval(pollRunMeta, RUN_META_POLL_MS);
    pollTrace();
    pollMeta();
    pollRunMeta();
    return () => {
      clearInterval(t2);
      clearInterval(t3);
      clearInterval(t4);
    };
  }, [applicationId, loadTask, pollTrace, pollMeta, pollRunMeta]);

  useEffect(() => {
    if (!applicationId || !streamFailed) return undefined;
    const id = setInterval(() => setFrameTs(Date.now()), FRAME_POLL_MS);
    setFrameTs(Date.now());
    return () => clearInterval(id);
  }, [applicationId, streamFailed]);

  async function submitOperatorNote() {
    const note = operatorNote.trim();
    if (!note || !applicationId) return;
    setNoteBusy(true);
    setNoteMsg('');
    try {
      const res = await apiFetch(`/jobs/${applicationId}/nova-act/operator-note`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      if (res.ok) {
        setOperatorNote('');
        setNoteMsg('Saved to trace');
        pollTrace();
      } else {
        const t = await res.text();
        setNoteMsg(t || `HTTP ${res.status}`);
      }
    } catch (e) {
      setNoteMsg(e?.message || 'Failed');
    } finally {
      setNoteBusy(false);
    }
  }

  if (!applicationId) return null;

  const urlBar = pageUrl || jobPostingUrl || '—';
  const showFallback = fallbackImageUrl && (!hasFrame || frameBroken);
  const isBrowserbaseApply = Boolean(browserbaseSessionId);
  const openBbUrl = browserbaseConsoleUrl || consoleUrl;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.disclosure}>
        <Text style={styles.disclosureText}>
          {isBrowserbaseApply
            ? 'This apply run uses Browserbase (cloud browser) + Stagehand. The panel below streams frames from your API server (periodic screenshots of the remote session). For the full interactive session, open the Browserbase live link.'
            : 'Live view uses Chromium CDP screencast (MJPEG) from the same Playwright session that runs Nova Act tool calls — closest match to the hosted Playground without AWS pixel streaming. If the stream fails (e.g. Vercel buffering or API_KEY on images), we fall back to polling JPEG/PNG. nova.amazon.com/act remains a separate product.'}
        </Text>
        {isBrowserbaseApply && openBbUrl ? (
          <TouchableOpacity
            style={styles.bbLinkBtn}
            onPress={() => window.open(openBbUrl, '_blank', 'noopener,noreferrer')}
          >
            <Text style={styles.bbLinkBtnText}>Open Browserbase live session</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(260px, 26%) 1fr', gap: 12, width: '100%' }}>
        {showTaskAndNotes && !compact && (
          <View style={styles.leftCol}>
            <Text style={styles.sectionTitle}>Apply task (read-only)</Text>
            <Text style={styles.helpSmall}>
              Sent to CreateAct on AWS. The service API does not support editing this text mid-run; use operator notes for
              your own checklist.
            </Text>
            <ScrollView style={styles.taskScroll} nestedScrollEnabled>
              <Text style={styles.taskBody}>{taskText || '…'}</Text>
            </ScrollView>
            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Operator note</Text>
            <TextInput
              style={styles.noteInput}
              value={operatorNote}
              onChangeText={setOperatorNote}
              placeholder="Append a line to the trace (team context, not sent to the model)"
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
            <TouchableOpacity
              style={[styles.noteBtn, noteBusy && { opacity: 0.6 }]}
              onPress={submitOperatorNote}
              disabled={noteBusy}
            >
              <Text style={styles.noteBtnText}>{noteBusy ? 'Saving…' : 'Append to trace'}</Text>
            </TouchableOpacity>
            {noteMsg ? <Text style={styles.noteMsg}>{noteMsg}</Text> : null}
          </View>
        )}

        <View style={styles.rightCol}>
          <View style={styles.browserChrome}>
            <Text style={styles.chromeLabel}>Automation browser</Text>
            <View style={styles.urlBarBox}>
              <Text style={styles.urlBarText} numberOfLines={1}>{urlBar}</Text>
            </View>
            {!isBrowserbaseApply && consoleUrl ? (
              <TouchableOpacity onPress={() => window.open(consoleUrl, '_blank', 'noopener,noreferrer')}>
                <Text style={styles.consoleLink}>Open AWS Nova Act console</Text>
              </TouchableOpacity>
            ) : null}
            {isBrowserbaseApply && openBbUrl ? (
              <TouchableOpacity onPress={() => window.open(openBbUrl, '_blank', 'noopener,noreferrer')}>
                <Text style={styles.consoleLink}>Open Browserbase session (same tab as automation)</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <div style={{ position: 'relative', background: '#0d0d12', borderRadius: 10, overflow: 'hidden', minHeight: compact ? 200 : 280 }}>
            {!streamFailed && streamUrl ? (
              <img
                key={`stream-${applicationId}`}
                src={streamUrl}
                alt="Live CDP screencast"
                style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: compact ? 320 : 420 }}
                onError={() => setStreamFailed(true)}
              />
            ) : null}
            {streamFailed && !showFallback && (!hasFrame || frameBroken) && (
              <View style={styles.frameLoading}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.frameLoadingText}>
                  {isBrowserbaseApply
                    ? 'Waiting for first screenshot from Browserbase session…'
                    : 'Waiting for viewport (poll mode)…'}
                </Text>
              </View>
            )}
            {streamFailed && liveFrameSrc && hasFrame && !frameBroken && (
              <img
                src={liveFrameSrc}
                alt="Live automation viewport"
                style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: compact ? 320 : 420 }}
                onLoad={() => setFrameBroken(false)}
                onError={() => setFrameBroken(true)}
              />
            )}
            {showFallback && (
              <img
                src={fallbackImageUrl}
                alt="Fallback screenshot"
                style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: compact ? 280 : 400 }}
              />
            )}
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>
                {isBrowserbaseApply
                  ? hasFrame && !frameBroken
                    ? '● Browserbase (server mirror)'
                    : '○ Waiting for screenshot…'
                  : !streamFailed && streamUrl
                    ? '● CDP stream'
                    : hasFrame && !frameBroken
                      ? '● Poll frame'
                      : '○ No live frame'}
              </Text>
            </View>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 10, marginTop: 10 }}>
            <View style={styles.outPanel}>
              <Text style={styles.outTitle}>Agent reasoning</Text>
              <ScrollView style={styles.outScroll} nestedScrollEnabled>
                {thinking.length === 0 ? (
                  <Text style={styles.outMuted}>Think steps (💭) appear here when the model uses the think tool.</Text>
                ) : (
                  thinking.slice(-80).map((line, i) => (
                    <Text key={`th-${i}`} style={styles.outLineThinking}>{line}</Text>
                  ))
                )}
              </ScrollView>
            </View>
            <View style={styles.outPanel}>
              <Text style={styles.outTitle}>Activity & tools</Text>
              <ScrollView style={styles.outScroll} nestedScrollEnabled>
                {activity.length === 0 ? (
                  <Text style={styles.outMuted}>Steps, CloudWatch snippets, and tool calls appear here.</Text>
                ) : (
                  activity.slice(-120).map((line, i) => (
                    <Text key={`ac-${i}`} style={styles.outLineActivity}>{line}</Text>
                  ))
                )}
              </ScrollView>
            </View>
          </div>
        </View>
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  wrapCompact: {
    padding: 8,
  },
  disclosure: {
    marginBottom: 10,
    padding: 8,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
  },
  disclosureText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  bbLinkBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '28',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  bbLinkBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  leftCol: {
    maxHeight: 520,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  helpSmall: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginBottom: 6,
    lineHeight: 14,
  },
  taskScroll: {
    maxHeight: 200,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 8,
  },
  taskBody: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  noteInput: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    color: theme.colors.text,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  noteBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '33',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  noteBtnText: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 12,
  },
  noteMsg: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
  },
  browserChrome: {
    marginBottom: 8,
  },
  chromeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: 4,
  },
  urlBarBox: {
    backgroundColor: '#1a1a22',
    borderRadius: 8,
    padding: 8,
  },
  urlBarText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#a8b0c8',
  },
  consoleLink: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  frameLoading: {
    padding: 32,
    alignItems: 'center',
  },
  frameLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveBadgeText: {
    fontSize: 10,
    color: '#9f9',
    fontWeight: '700',
  },
  outPanel: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 160,
    maxHeight: 220,
    padding: 8,
  },
  outTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  outScroll: {
    flex: 1,
  },
  outMuted: {
    fontSize: 11,
    color: theme.colors.textMuted,
    lineHeight: 15,
  },
  outLineThinking: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#c9b8e8',
    lineHeight: 15,
    marginBottom: 4,
  },
  outLineActivity: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#9ab8a8',
    lineHeight: 15,
    marginBottom: 3,
  },
});
