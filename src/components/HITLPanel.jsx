import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { timeAgo, truncate } from '../utils/formatters';
import { apiFetch, buildApiPath } from '../config.js';
import theme from '../theme';

const POLL_INTERVAL = 5000;

export default function HITLPanel() {
  const [blockers, setBlockers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { lastMessage } = useWebSocket();
  const navigate = useNavigate();

  const fetchBlockers = useCallback(async () => {
    setFetchError(null);
    try {
      const [pendingRes, allRes] = await Promise.all([
        apiFetch('/hitl'),
        apiFetch('/hitl/all'),
      ]);
      if (!pendingRes.ok || !allRes.ok) {
        const p = !pendingRes.ok ? `pending ${pendingRes.status}` : '';
        const a = !allRes.ok ? `all ${allRes.status}` : '';
        setFetchError([p, a].filter(Boolean).join(' · ') || 'Request failed');
        setLoading(false);
        return;
      }
      setBlockers(await pendingRes.json());
      const all = await allRes.json();
      setHistory(all.filter((b) => b.status !== 'pending'));
    } catch (e) {
      setFetchError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlockers();
    const interval = setInterval(fetchBlockers, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchBlockers]);

  useEffect(() => {
    if (!lastMessage) return;

    if ((lastMessage.type === 'blocker:created' || lastMessage.type === 'hitl:new_blocker') && lastMessage.blocker) {
      setBlockers((prev) => {
        if (prev.some((b) => b.id === lastMessage.blocker.id)) return prev;
        return [lastMessage.blocker, ...prev];
      });
    }

    if ((lastMessage.type === 'blocker:resolved' || lastMessage.type === 'hitl:resolved') && (lastMessage.blocker?.id || lastMessage.blockerId)) {
      const resolvedId = lastMessage.blocker?.id || lastMessage.blockerId;
      setBlockers((prev) => prev.filter((b) => b.id !== resolvedId));
    }

    if (lastMessage.type === 'blocker:skipped' && (lastMessage.blocker?.id || lastMessage.blockerId)) {
      const skippedId = lastMessage.blocker?.id || lastMessage.blockerId;
      setBlockers((prev) => prev.filter((b) => b.id !== skippedId));
    }
  }, [lastMessage]);

  const handleResume = async (id) => {
    setActionError(null);
    try {
      const res = await apiFetch(`/hitl/${id}/resume`, { method: 'POST' });
      if (!res.ok) {
        const t = await res.text();
        setActionError(t || `Resume failed (${res.status})`);
        return;
      }
      setBlockers((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setActionError(e?.message || 'Resume failed');
    }
  };

  const handleSkip = async (id) => {
    setActionError(null);
    try {
      const res = await apiFetch(`/hitl/${id}/skip`, { method: 'POST' });
      if (!res.ok) {
        const t = await res.text();
        setActionError(t || `Skip failed (${res.status})`);
        return;
      }
      setBlockers((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setActionError(e?.message || 'Skip failed');
    }
  };

  const openInBrowser = (url) => {
    window.open(url, '_blank', 'noopener');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const showEmpty = !fetchError && blockers.length === 0 && history.length === 0;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Interventions</Text>
      <Text style={styles.subheading}>Manual actions required by the agent</Text>

      {fetchError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>Could not load interventions</Text>
          <Text style={styles.errorBody}>{fetchError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchBlockers(); }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {actionError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBody}>{actionError}</Text>
          <TouchableOpacity onPress={() => setActionError(null)}>
            <Text style={styles.dismissLink}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {showEmpty ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>No pending interventions</Text>
          <Text style={styles.emptyHint}>The agent is running autonomously.</Text>
        </View>
      ) : blockers.length > 0 ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {blockers.map((blocker) => (
            <View key={blocker.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.idBadge}>
                  <Text style={styles.idText}>{truncate(blocker.applicationId, 12)}</Text>
                </View>
                <Text style={styles.timestamp}>{timeAgo(blocker.createdAt || blocker.timestamp)}</Text>
              </View>

              <Text style={styles.reason}>{blocker.reason}</Text>

              {blocker.id && (
                <View style={styles.screenshotContainer}>
                  <img
                    src={buildApiPath(`/hitl/${blocker.id}/screenshot`)}
                    alt="Blocker screenshot"
                    style={{
                      width: '100%',
                      maxHeight: 240,
                      objectFit: 'contain',
                      borderRadius: theme.borderRadius.sm,
                      backgroundColor: theme.colors.background,
                    }}
                  />
                </View>
              )}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.browserBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                  onPress={() => navigate(`/interventions/${blocker.id}`)}
                >
                  <Text style={[styles.browserBtnText, { color: '#fff' }]}>View & Interact</Text>
                </TouchableOpacity>
                {blocker.liveUrl && (
                  <TouchableOpacity
                    style={styles.browserBtn}
                    onPress={() => openInBrowser(blocker.liveUrl)}
                  >
                    <Text style={styles.browserBtnText}>Open in Browser</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.resumeBtn}
                  onPress={() => handleResume(blocker.id)}
                >
                  <Text style={styles.resumeBtnText}>Resume Agent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={() => handleSkip(blocker.id)}
                >
                  <Text style={styles.skipBtnText}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {history.length > 0 && (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text style={[styles.heading, { fontSize: theme.fonts.lg }]}>History</Text>
              <Text style={[styles.subheading, { marginBottom: theme.spacing.md }]}>Previously handled interventions</Text>
              {history.map((item) => (
                <View key={item.id} style={[styles.card, { opacity: 0.7, marginBottom: theme.spacing.sm }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.idBadge, { backgroundColor: item.status === 'resolved' ? theme.colors.success + '22' : theme.colors.warning + '22' }]}>
                      <Text style={[styles.idText, { color: item.status === 'resolved' ? theme.colors.success : theme.colors.warning }]}>
                        {item.status === 'resolved' ? 'Resolved' : 'Skipped'}
                      </Text>
                    </View>
                    <Text style={styles.timestamp}>{timeAgo(item.resolvedAt || item.createdAt)}</Text>
                  </View>
                  <Text style={styles.reason}>{item.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}

      {blockers.length === 0 && history.length > 0 && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyTitle}>No pending interventions</Text>
            <Text style={styles.emptyHint}>The agent is running autonomously.</Text>
          </View>
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={[styles.heading, { fontSize: theme.fonts.lg }]}>History</Text>
            <Text style={[styles.subheading, { marginBottom: theme.spacing.md }]}>Previously handled interventions</Text>
            {history.map((item) => (
              <View key={item.id} style={[styles.card, { opacity: 0.7, marginBottom: theme.spacing.sm }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.idBadge, { backgroundColor: item.status === 'resolved' ? theme.colors.success + '22' : theme.colors.warning + '22' }]}>
                    <Text style={[styles.idText, { color: item.status === 'resolved' ? theme.colors.success : theme.colors.warning }]}>
                      {item.status === 'resolved' ? 'Resolved' : 'Skipped'}
                    </Text>
                  </View>
                  <Text style={styles.timestamp}>{timeAgo(item.resolvedAt || item.createdAt)}</Text>
                </View>
                <Text style={styles.reason}>{item.reason}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40, gap: theme.spacing.md },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyIcon: {
    fontSize: theme.fonts.xxl,
    color: theme.colors.success,
    marginBottom: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: theme.fonts.lg,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  emptyHint: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
  },
  errorBanner: {
    backgroundColor: theme.colors.error + '12',
    borderWidth: 1,
    borderColor: theme.colors.error + '44',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    fontSize: theme.fonts.sm,
    fontWeight: '700',
    color: theme.colors.error,
    marginBottom: theme.spacing.xs,
  },
  errorBody: {
    fontSize: theme.fonts.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.error + '22',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  retryBtnText: {
    color: theme.colors.error,
    fontWeight: '600',
    fontSize: theme.fonts.sm,
  },
  dismissLink: {
    fontSize: theme.fonts.xs,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  idBadge: {
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  idText: {
    fontSize: theme.fonts.xs,
    color: theme.colors.primary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  timestamp: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
  },
  reason: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  screenshotContainer: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  browserBtn: {
    backgroundColor: theme.colors.surfaceHover,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  browserBtnText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  resumeBtn: {
    backgroundColor: theme.colors.success + '18',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.success + '44',
  },
  resumeBtnText: {
    color: theme.colors.success,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  skipBtn: {
    backgroundColor: theme.colors.surfaceHover,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  skipBtnText: {
    color: theme.colors.textMuted,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
});
