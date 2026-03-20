import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../utils/formatters';
import theme from '../theme';

const PRESETS = [
  { label: 'Every 6 Hours', cron: '0 */6 * * *' },
  { label: 'Every 12 Hours', cron: '0 */12 * * *' },
  { label: 'Daily', cron: '0 9 * * *' },
  { label: 'Weekly', cron: '0 9 * * 1' },
];

export default function Scheduler() {
  const api = useApi();
  const [schedule, setSchedule] = useState(null);
  const [cron, setCron] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/schedule').then((data) => {
      if (data) {
        setSchedule(data);
        setCron(data.cron || '');
        setEnabled(data.enabled !== false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreset = (preset) => {
    setCron(preset.cron);
  };

  const handleSave = async () => {
    const result = await api.post('/schedule', { cron, enabled });
    if (result) {
      setSchedule(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleClear = async () => {
    await api.del('/schedule');
    setSchedule(null);
    setCron('');
    setEnabled(true);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Scheduler</Text>
      <Text style={styles.subheading}>Configure automated pipeline runs</Text>

      {schedule && (
        <View style={styles.currentCard}>
          <Text style={styles.sectionTitle}>Current Schedule</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={[styles.infoValue, { color: schedule.enabled ? theme.colors.success : theme.colors.textMuted }]}>
                {schedule.enabled ? 'Active' : 'Paused'}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Cron Expression</Text>
              <Text style={styles.infoValue}>{schedule.cron || '—'}</Text>
            </View>
            {schedule.nextRun && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Next Run</Text>
                <Text style={styles.infoValue}>{formatDateTime(schedule.nextRun)}</Text>
              </View>
            )}
            {schedule.lastRun && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Last Run</Text>
                <Text style={styles.infoValue}>{formatDateTime(schedule.lastRun)}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quick Presets</Text>
        <View style={styles.presetsRow}>
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p.cron}
              style={[styles.presetBtn, cron === p.cron && styles.presetBtnActive]}
              onPress={() => handlePreset(p)}
            >
              <Text style={[styles.presetText, cron === p.cron && styles.presetTextActive]}>
                {p.label}
              </Text>
              <Text style={styles.presetCron}>{p.cron}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Custom Cron Expression</Text>
        <TextInput
          style={styles.cronInput}
          value={cron}
          onChangeText={setCron}
          placeholder="e.g. 0 */6 * * *"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Text style={styles.cronHelp}>
          Format: minute hour day-of-month month day-of-week
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Options</Text>
        <TouchableOpacity style={styles.toggleRow} onPress={() => setEnabled(!enabled)}>
          <View style={[styles.toggle, enabled && styles.toggleActive]}>
            <View style={[styles.toggleDot, enabled && styles.toggleDotActive]} />
          </View>
          <Text style={styles.toggleLabel}>{enabled ? 'Enabled' : 'Disabled'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.saveBtn, api.loading && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={api.loading}
        >
          {api.loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Schedule'}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearBtnText}>Clear / Stop</Text>
        </TouchableOpacity>
      </View>

      {api.error && (
        <Text style={styles.errorText}>{api.error}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40, maxWidth: 700 },
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
  currentCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
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
  infoRow: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
    flexWrap: 'wrap',
  },
  infoItem: {},
  infoLabel: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    fontWeight: '500',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  presetBtn: {
    backgroundColor: theme.colors.surfaceHover,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  presetBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '18',
  },
  presetText: {
    fontSize: theme.fonts.sm,
    color: theme.colors.text,
    fontWeight: '600',
  },
  presetTextActive: {
    color: theme.colors.primary,
  },
  presetCron: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  cronInput: {
    backgroundColor: theme.colors.surfaceHover,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fonts.md,
    fontFamily: 'monospace',
    outlineColor: theme.colors.primary,
  },
  cronHelp: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceHover,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: theme.colors.primary + '33',
    borderColor: theme.colors.primary,
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.textMuted,
  },
  toggleDotActive: {
    backgroundColor: theme.colors.primary,
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.md,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.md,
  },
  clearBtn: {
    backgroundColor: theme.colors.surfaceHover,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  clearBtnText: {
    color: theme.colors.error,
    fontWeight: '600',
    fontSize: theme.fonts.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fonts.sm,
    marginTop: theme.spacing.sm,
  },
});
