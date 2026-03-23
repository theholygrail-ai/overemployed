import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { buildApiPath, apiFetch } from '../config.js';
import { formatDateTime } from '../utils/formatters';
import theme from '../theme';

/**
 * Full-screen verification gallery for successful automation applies.
 */
export default function ApplicationProofModal({ applicationId, roleTitle, company, onClose }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgTs, setImgTs] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/jobs/${applicationId}/apply-proof/meta`);
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const data = await res.json();
        if (!cancelled) setMeta(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load proof');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  const shots = meta?.shots || [];
  const hasShots = shots.length > 0;

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>Application verification</Text>
            <Text style={styles.modalSubtitle}>
              {roleTitle || 'Application'}{company ? ` · ${company}` : ''}
            </Text>
            {meta?.capturedAt && (
              <Text style={styles.capturedAt}>Captured: {formatDateTime(meta.capturedAt)}</Text>
            )}
            {meta?.engine && (
              <Text style={styles.engine}>Engine: {meta.engine}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: 40 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !hasShots ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No automation screenshots stored</Text>
            <Text style={styles.emptyBody}>
              This can happen if the job was marked Applied manually, or the apply ran before screenshot
              verification was enabled. Successful automation runs from now on will store proof images here.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.instructions}>
              Review every screenshot below to confirm the submission page and your data look correct.
            </Text>
            {shots.map((shot) => {
              const url = `${buildApiPath(`/jobs/${applicationId}/apply-proof/${shot.index}`)}?t=${imgTs}`;
              return (
                <View key={`${shot.index}-${shot.label}`} style={styles.shotBlock}>
                  <Text style={styles.shotLabel}>
                    {shot.label || `Screenshot ${shot.index + 1}`}
                  </Text>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img
                    src={url}
                    alt={shot.label || 'Application screenshot'}
                    style={styles.img}
                  />
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.footer}>
          {hasShots && (
            <TouchableOpacity style={styles.refreshBtn} onPress={() => setImgTs(Date.now())}>
              <Text style={styles.refreshBtnText}>Refresh images</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: theme.spacing.md,
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxWidth: 960,
    maxHeight: '92vh',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fonts.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  modalSubtitle: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  capturedAt: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  engine: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
  },
  closeButton: {
    padding: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  closeText: {
    fontSize: theme.fonts.lg,
    color: theme.colors.textMuted,
  },
  scroll: { maxHeight: '65vh' },
  scrollContent: { padding: theme.spacing.md, paddingBottom: theme.spacing.lg },
  instructions: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  shotBlock: { marginBottom: theme.spacing.lg },
  shotLabel: {
    fontSize: theme.fonts.sm,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  img: {
    width: '100%',
    height: 'auto',
    maxWidth: '100%',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  errorText: { color: theme.colors.error, padding: theme.spacing.md },
  empty: { padding: theme.spacing.lg },
  emptyTitle: {
    fontSize: theme.fonts.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  emptyBody: { fontSize: theme.fonts.sm, color: theme.colors.textSecondary, lineHeight: 22 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  refreshBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceHover,
  },
  refreshBtnText: { fontSize: theme.fonts.sm, color: theme.colors.primary, fontWeight: '600' },
  doneBtn: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primary,
  },
  doneBtnText: { fontSize: theme.fonts.sm, color: '#fff', fontWeight: '700' },
});
