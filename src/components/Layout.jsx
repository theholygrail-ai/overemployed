import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocation, Link } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import theme from '../theme';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '◈' },
  { path: '/jobs', label: 'Jobs', icon: '◻' },
  { path: '/scheduler', label: 'Scheduler', icon: '⏱' },
  { path: '/monitor', label: 'Agent Monitor', icon: '◉' },
  { path: '/interventions', label: 'Interventions', icon: '⚡' },
  { path: '/profile', label: 'Profile', icon: '◎' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { connected } = useWebSocket();

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <View style={styles.brand}>
          <Text style={styles.brandIcon}>⬡</Text>
          <Text style={styles.brandText}>OverEmployed</Text>
        </View>

        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{ textDecoration: 'none' }}
              >
                <View style={[styles.navItem, active && styles.navItemActive]}>
                  <Text style={[styles.navIcon, active && styles.navTextActive]}>
                    {item.icon}
                  </Text>
                  <Text style={[styles.navLabel, active && styles.navTextActive]}>
                    {item.label}
                  </Text>
                </View>
              </Link>
            );
          })}
        </View>

        <View style={styles.sidebarFooter}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, connected ? styles.dotConnected : styles.dotDisconnected]} />
            <Text style={styles.statusText}>
              {connected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.main}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    minHeight: '100vh',
    backgroundColor: theme.colors.background,
  },
  sidebar: {
    width: 240,
    backgroundColor: theme.colors.surface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    paddingVertical: theme.spacing.lg,
    justifyContent: 'flex-start',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  brandIcon: {
    fontSize: theme.fonts.xl,
    color: theme.colors.primary,
    marginRight: theme.spacing.sm,
  },
  brandText: {
    fontSize: theme.fonts.lg,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  nav: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: theme.colors.primary + '18',
  },
  navIcon: {
    fontSize: theme.fonts.md,
    color: theme.colors.textMuted,
    marginRight: theme.spacing.md,
    width: 20,
    textAlign: 'center',
  },
  navLabel: {
    fontSize: theme.fonts.md,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  navTextActive: {
    color: theme.colors.primary,
  },
  sidebarFooter: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.sm,
  },
  dotConnected: {
    backgroundColor: theme.colors.success,
  },
  dotDisconnected: {
    backgroundColor: theme.colors.error,
  },
  statusText: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
  },
  main: {
    flex: 1,
    padding: theme.spacing.xl,
    overflow: 'auto',
  },
});
