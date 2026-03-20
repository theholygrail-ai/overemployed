import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { timeAgo, formatDateTime } from '../utils/formatters';
import MetricCard from './MetricCard';
import theme from '../theme';

const RUN_SAFETY_MS = 15 * 60 * 1000;

export default function Dashboard() {
  const api = useApi();
  const navigate = useNavigate();
  const { messages, connected } = useWebSocket();
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [runError, setRunError] = useState(null);
  const [linkedInStatus, setLinkedInStatus] = useState(null);
  const safetyTimerRef = useRef(null);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const refreshMetrics = useCallback(() => {
    api.get('/metrics').then((data) => data && setMetrics(data));
    api.get('/agents/history').then((data) => data && setHistory(data));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refreshMetrics();
    api.get('/schedule').then((data) => data && setSchedule(data));
    api.get('/auth/linkedin/status').then((data) => data && setLinkedInStatus(data));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRunNow = async () => {
    setRunError(null);
    setLastResult(null);
    setRunning(true);
    clearSafetyTimer();
    safetyTimerRef.current = setTimeout(() => {
      setRunning(false);
      setRunError('No completion signal received (timeout). Check WebSocket or server logs.');
    }, RUN_SAFETY_MS);
    try {
      await api.post('/agents/run');
    } catch (e) {
      clearSafetyTimer();
      setRunning(false);
      setRunError(e?.message || 'Failed to start pipeline');
    }
  };

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;

    if (last.type === 'agent:run_complete') {
      clearSafetyTimer();
      setRunning(false);
      setLastResult(last.result ?? null);
      setRunError(null);
      refreshMetrics();
      api.get('/auth/linkedin/status').then((data) => data && setLinkedInStatus(data));
    }
    if (last.type === 'agent:run_error') {
      clearSafetyTimer();
      setRunning(false);
      setRunError(last.error || 'Unknown error');
      setLastResult(null);
      refreshMetrics();
    }
  }, [messages, clearSafetyTimer, refreshMetrics]);

  useEffect(() => () => clearSafetyTimer(), [clearSafetyTimer]);

  const recentActivity = messages.slice(-15).reverse();

  const lastWsMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;
  const progressHint =
    lastWsMessage?.message ||
    (lastWsMessage?.type === 'agent_log'
      ? lastWsMessage.message
      : null) ||
    'Working…';

  const resultSummary =
    lastResult &&
    `Found ${lastResult.jobsFound ?? 0} jobs, ${lastResult.cvsGenerated ?? 0} CVs generated, ${lastResult.stored ?? 0} saved`;

  const linkedInPill = () => {
    const hint = linkedInStatus?.linkedInScrapeHint;
    const hasCookie = linkedInStatus?.hasCookie;
    let label = 'LinkedIn: Not configured';
    let bg = theme.colors.surfaceHover;
    let color = theme.colors.textMuted;
    if (hasCookie) {
      if (hint === 'ok') {
        label = 'LinkedIn: Connected';
        bg = theme.colors.success + '22';
        color = theme.colors.success;
      } else if (hint === 'warning') {
        label = 'LinkedIn: Cookie may be invalid (0 jobs last run)';
        bg = theme.colors.warning + '22';
        color = theme.colors.warning;
      } else {
        label = 'LinkedIn: Cookie set — run pipeline to verify';
        bg = theme.colors.surfaceHover;
        color = theme.colors.textSecondary;
      }
    }
    return (
      <TouchableOpacity
        style={[styles.linkedinPill, { backgroundColor: bg }]}
        onPress={() => navigate('/settings')}
      >
        <Text style={[styles.linkedinPillText, { color }]}>{label}</Text>
        <Text style={styles.linkedinPillChev}>Settings →</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heading}>Dashboard</Text>
          <Text style={styles.subheading}>Pipeline overview and quick actions</Text>
          <View style={styles.pillRow}>{linkedInPill()}</View>
        </View>
        <TouchableOpacity
          style={[styles.runButton, running && styles.runButtonDisabled]}
          onPress={handleRunNow}
          disabled={running}
        >
          {running ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.runButtonText}>▶ Run Now</Text>
          )}
        </TouchableOpacity>
      </View>

      {running && (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>Pipeline running…</Text>
          <Text style={styles.progressSub}>{progressHint}</Text>
          <View style={styles.progressBarOuter}>
            <View style={styles.progressBarInner} />
          </View>
        </View>
      )}

      {runError && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Last run error</Text>
          <Text style={styles.errorText}>{runError}</Text>
        </View>
      )}

      {!running && lastResult && !runError && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Last run</Text>
          <Text style={styles.resultText}>{resultSummary}</Text>
        </View>
      )}

      {api.loading && !metrics ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.metricsRow}>
          <MetricCard
            title="Total Runs"
            value={metrics?.totalRuns ?? 0}
            icon="⟳"
            color={theme.colors.primary}
          />
          <MetricCard
            title="Jobs Found"
            value={metrics?.jobsFound ?? 0}
            icon="◻"
            color={theme.colors.warning}
          />
          <MetricCard
            title="CVs Ready"
            value={metrics?.cvsReady ?? 0}
            icon="📄"
            color={theme.colors.success}
          />
          <MetricCard
            title="Applications"
            value={metrics?.applicationsTracked ?? 0}
            icon="📨"
            color="#06b6d4"
          />
          <MetricCard
            title="Last Run"
            value={metrics?.lastRun ? timeAgo(metrics.lastRun) : 'Never'}
            icon="⏱"
            color={theme.colors.textSecondary}
            subtitle={metrics?.lastRun ? formatDateTime(metrics.lastRun) : null}
          />
        </View>
      )}

      {schedule && (
        <View style={styles.scheduleCard}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.scheduleRow}>
            <View style={styles.scheduleItem}>
              <Text style={styles.scheduleLabel}>Status</Text>
              <Text style={[styles.scheduleValue, { color: schedule.enabled ? theme.colors.success : theme.colors.textMuted }]}>
                {schedule.enabled ? 'Active' : 'Paused'}
              </Text>
            </View>
            {schedule.nextRun && (
              <View style={styles.scheduleItem}>
                <Text style={styles.scheduleLabel}>Next Run</Text>
                <Text style={styles.scheduleValue}>{formatDateTime(schedule.nextRun)}</Text>
              </View>
            )}
            {schedule.cron && (
              <View style={styles.scheduleItem}>
                <Text style={styles.scheduleLabel}>Cron</Text>
                <Text style={styles.scheduleValue}>{schedule.cron}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.columnsRow}>
        <View style={styles.activityCol}>
          <Text style={styles.sectionTitle}>Live Activity</Text>
          <View style={styles.feed}>
            {recentActivity.length === 0 ? (
              <Text style={styles.emptyText}>No recent activity{connected ? '' : ' — disconnected'}</Text>
            ) : (
              recentActivity.map((msg, i) => (
                <View key={(msg._ts || '') + '-' + i} style={styles.feedItem}>
                  <Text style={styles.feedDot}>●</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedMsg}>
                      {msg.message || `[${msg.agent || msg.type}] ${msg.event || ''}`}
                    </Text>
                    {msg.agent && <Text style={styles.feedAgent}>{msg.agent}</Text>}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <View style={styles.historyCol}>
          <Text style={styles.sectionTitle}>Run History</Text>
          <View style={styles.feed}>
            {history.length === 0 ? (
              <Text style={styles.emptyText}>No runs yet</Text>
            ) : (
              history.slice(0, 10).map((run, i) => (
                <View key={run.id || i} style={styles.feedItem}>
                  <Text style={[styles.feedDot, { color: run.status === 'error' ? theme.colors.error : theme.colors.success }]}>●</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedMsg}>
                      {run.status === 'error' ? 'Failed' : `Found ${run.jobsFound ?? 0} jobs`}
                    </Text>
                    <Text style={styles.feedAgent}>{timeAgo(run.startedAt || run.timestamp)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  pillRow: { marginTop: theme.spacing.sm },
  linkedinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    gap: 8,
  },
  linkedinPillText: { fontSize: theme.fonts.xs, fontWeight: '600' },
  linkedinPillChev: { fontSize: theme.fonts.xs, color: theme.colors.textMuted },
  heading: {
    fontSize: theme.fonts.xxl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subheading: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  runButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.md,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.md,
  },
  progressCard: {
    backgroundColor: theme.colors.primary + '18',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + '44',
  },
  progressTitle: { fontSize: theme.fonts.md, fontWeight: '700', color: theme.colors.primary },
  progressSub: { fontSize: theme.fonts.sm, color: theme.colors.text, marginTop: 4 },
  progressBarOuter: {
    height: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: 3,
    marginTop: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    width: '40%',
    backgroundColor: theme.colors.primary,
    borderRadius: 3,
  },
  errorCard: {
    backgroundColor: theme.colors.error + '15',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.error + '44',
  },
  errorTitle: { fontSize: theme.fonts.sm, fontWeight: '700', color: theme.colors.error },
  errorText: { fontSize: theme.fonts.sm, color: theme.colors.text, marginTop: 4 },
  resultCard: {
    backgroundColor: theme.colors.success + '12',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.success + '33',
  },
  resultTitle: { fontSize: theme.fonts.sm, fontWeight: '700', color: theme.colors.success },
  resultText: { fontSize: theme.fonts.sm, color: theme.colors.text, marginTop: 4 },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  scheduleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
    marginTop: theme.spacing.sm,
  },
  scheduleItem: {},
  scheduleLabel: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  scheduleValue: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    fontWeight: '500',
  },
  columnsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  activityCol: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  historyCol: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fonts.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.sm,
  },
  feed: {},
  feedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  feedDot: {
    color: theme.colors.primary,
    fontSize: 8,
    marginRight: theme.spacing.sm,
    marginTop: 5,
  },
  feedMsg: {
    fontSize: theme.fonts.sm,
    color: theme.colors.text,
  },
  feedAgent: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  emptyText: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.md,
  },
});
