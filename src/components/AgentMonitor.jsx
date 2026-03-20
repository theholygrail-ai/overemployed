import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useWebSocket } from '../hooks/useWebSocket';
import theme from '../theme';

const PIPELINE_STAGES = [
  { key: 'orchestrator', label: 'Orchestrator', icon: '◈' },
  { key: 'researcher', label: 'Researcher', icon: '🔍' },
  { key: 'cv_generator', label: 'CV Generator', icon: '📄' },
  { key: 'reviewer', label: 'Reviewer', icon: '✓' },
];

const STAGE_COLORS = {
  idle: theme.colors.textMuted,
  running: theme.colors.warning,
  complete: theme.colors.success,
  error: theme.colors.error,
};

export default function AgentMonitor() {
  const { messages, connected } = useWebSocket();
  const [stages, setStages] = useState(
    Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 'idle']))
  );
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  useEffect(() => {
    if (messages.length === 0) return;
    const msg = messages[messages.length - 1];

    if (msg.agent) {
      const stageKey = msg.agent.toLowerCase().replace(/\s+/g, '_');
      if (stages[stageKey] !== undefined) {
        setStages((prev) => ({
          ...prev,
          [stageKey]: msg.status || (msg.type === 'error' ? 'error' : 'running'),
        }));
      }
    }

    setLog((prev) => {
      const next = [...prev, { ...msg, _logTs: Date.now() }];
      return next.slice(-200);
    });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollToEnd?.({ animated: true });
    }
  }, [log]);

  const clearLog = () => {
    setLog([]);
    setStages(Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 'idle'])));
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.heading}>Agent Monitor</Text>
          <Text style={styles.subheading}>
            Real-time pipeline status
            {!connected && ' — disconnected'}
          </Text>
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={clearLog}>
          <Text style={styles.clearBtnText}>Clear Log</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.pipeline}>
        {PIPELINE_STAGES.map((stage, i) => (
          <React.Fragment key={stage.key}>
            <View style={styles.stageCard}>
              <View style={[styles.stageIndicator, { backgroundColor: STAGE_COLORS[stages[stage.key]] }]} />
              <Text style={styles.stageIcon}>{stage.icon}</Text>
              <Text style={styles.stageLabel}>{stage.label}</Text>
              <Text style={[styles.stageStatus, { color: STAGE_COLORS[stages[stage.key]] }]}>
                {stages[stage.key]}
              </Text>
            </View>
            {i < PIPELINE_STAGES.length - 1 && (
              <View style={styles.arrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            )}
          </React.Fragment>
        ))}
      </View>

      <View style={styles.logSection}>
        <Text style={styles.sectionTitle}>Activity Log</Text>
        <ScrollView ref={logRef} style={styles.logScroll} contentContainerStyle={styles.logContent}>
          {log.length === 0 ? (
            <Text style={styles.emptyText}>
              Waiting for agent activity…{!connected ? ' (WebSocket disconnected)' : ''}
            </Text>
          ) : (
            log.map((entry, i) => (
              <View key={entry._logTs + '-' + i} style={styles.logEntry}>
                <Text style={[styles.logDot, { color: entry.type === 'error' ? theme.colors.error : theme.colors.primary }]}>
                  ●
                </Text>
                <Text style={styles.logTime}>
                  {new Date(entry._logTs).toLocaleTimeString()}
                </Text>
                {entry.agent && (
                  <View style={styles.logAgentBadge}>
                    <Text style={styles.logAgentText}>{entry.agent}</Text>
                  </View>
                )}
                <Text style={styles.logMessage}>
                  {entry.message || `[${entry.agent || entry.type}] ${entry.event || ''}`}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
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
  clearBtn: {
    backgroundColor: theme.colors.surfaceHover,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  clearBtnText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  pipeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  stageCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    minWidth: 130,
    borderWidth: 1,
    borderColor: theme.colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  stageIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  stageIcon: {
    fontSize: theme.fonts.xl,
    marginBottom: theme.spacing.xs,
  },
  stageLabel: {
    fontSize: theme.fonts.sm,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  stageStatus: {
    fontSize: theme.fonts.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  arrow: {
    paddingHorizontal: theme.spacing.xs,
  },
  arrowText: {
    fontSize: theme.fonts.xl,
    color: theme.colors.textMuted,
  },
  logSection: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: theme.fonts.sm,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logScroll: {
    maxHeight: '55vh',
  },
  logContent: {
    padding: theme.spacing.sm,
  },
  logEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '44',
  },
  logDot: {
    fontSize: 6,
    marginRight: theme.spacing.sm,
  },
  logTime: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    fontFamily: 'monospace',
    marginRight: theme.spacing.sm,
    minWidth: 75,
  },
  logAgentBadge: {
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
  },
  logAgentText: {
    fontSize: theme.fonts.xs,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  logMessage: {
    fontSize: theme.fonts.sm,
    color: theme.colors.text,
    flex: 1,
  },
  emptyText: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    padding: theme.spacing.md,
  },
});
