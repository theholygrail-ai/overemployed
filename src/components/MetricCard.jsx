import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../theme';

export default function MetricCard({ title, value, subtitle, color = theme.colors.primary, icon }) {
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.header}>
        {icon ? <Text style={[styles.icon, { color }]}>{icon}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={[styles.value, { color }]}>{value ?? '—'}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderLeftWidth: 3,
    minWidth: 150,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  icon: {
    fontSize: theme.fonts.md,
    marginRight: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: theme.fonts.xxl,
    fontWeight: '700',
    marginVertical: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textSecondary,
  },
});
