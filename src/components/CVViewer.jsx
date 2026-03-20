import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useApi } from '../hooks/useApi';
import theme from '../theme';

export default function CVViewer({ applicationId, onClose }) {
  const api = useApi();
  const [job, setJob] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (applicationId) {
      api.get(`/jobs/${applicationId}`).then((data) => data && setJob(data));
    }
  }, [applicationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = async () => {
    const text = job?.cv || job?.tailoredCV || '';
    if (text) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{job?.roleTitle || 'Loading…'}</Text>
            {job?.company && <Text style={styles.modalCompany}>{job.company}</Text>}
          </View>
          {job?.matchScore != null && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreText}>{job.matchScore} match</Text>
            </View>
          )}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {api.loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView style={styles.cvBody}>
            <Text style={styles.cvContent}>
              {job?.cv || job?.tailoredCV || 'No CV content available for this application.'}
            </Text>
          </ScrollView>
        )}

        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
            <Text style={styles.copyText}>{copied ? '✓ Copied' : '📋 Copy to Clipboard'}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    width: '70%',
    maxWidth: 800,
    maxHeight: '85vh',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.fonts.lg,
    fontWeight: '700',
    color: theme.colors.text,
  },
  modalCompany: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  scoreBadge: {
    backgroundColor: theme.colors.primary + '22',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.md,
  },
  scoreText: {
    color: theme.colors.primary,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceHover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fonts.md,
  },
  cvBody: {
    padding: theme.spacing.lg,
    maxHeight: '55vh',
  },
  cvContent: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    lineHeight: 24,
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
  },
  modalFooter: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    alignItems: 'flex-end',
  },
  copyButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  copyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.sm,
  },
});
