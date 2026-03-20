import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useWebSocket } from '../hooks/useWebSocket';
import { timeAgo, truncate } from '../utils/formatters';
import { apiFetch, buildApiPath } from '../config.js';
import theme from '../theme';

const POLL_INTERVAL = 5000;

export default function HITLPanel() {
  const [blockers, setBlockers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { lastMessage } = useWebSocket();

  const fetchBlockers = useCallback(async () => {
    try {
      const res = await apiFetch('/hitl');
      if (res.ok) {
        const data = await res.json();
        setBlockers(data);
      }
    } catch {
      /* silent */
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

    if (lastMessage.type === 'hitl:new_blocker' && lastMessage.blocker) {
      setBlockers((prev) => {
        if (prev.some((b) => b.id === lastMessage.blocker.id)) return prev;
        return [lastMessage.blocker, ...prev];
      });
    }

    if (lastMessage.type === 'hitl:resolved' && lastMessage.blockerId) {
      setBlockers((prev) => prev.filter((b) => b.id !== lastMessage.blockerId));
    }
  }, [lastMessage]);

  const handleResume = async (id) => {
    try {
      await apiFetch(`/hitl/${id}/resume`, { method: 'POST' });
      setBlockers((prev) => prev.filter((b) => b.id !== id));
    } catch {
      /* silent */
    }
  };

  const handleSkip = async (id) => {
    try {
      await apiFetch(`/hitl/${id}/skip`, { method: 'POST' });
      setBlockers((prev) => prev.filter((b) => b.id !== id));
    } catch {
      /* silent */
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

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Interventions</Text>
      <Text style={styles.subheading}>Manual actions required by the agent</Text>

      {blockers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>No pending interventions</Text>
          <Text style={styles.emptyHint}>The agent is running autonomously.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {blockers.map((blocker) => (
            <View key={blocker.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.idBadge}>
                  <Text style={styles.idText}>{truncate(blocker.applicationId, 12)}</Text>
                </View>
                <Text style={styles.timestamp}>{timeAgo(blocker.timestamp)}</Text>
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
