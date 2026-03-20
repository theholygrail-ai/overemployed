import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatDate, truncate, statusColor, sourceIcon, formatDateTime } from '../utils/formatters';
import { apiFetch } from '../config.js';
import CVViewer from './CVViewer';
import theme from '../theme';

const STATUS_OPTIONS = ['all', 'found', 'cv_generated', 'reviewed', 'ready', 'applying', 'blocked', 'applied', 'failed', 'rejected'];
const SORT_KEYS = ['roleTitle', 'company', 'source', 'matchScore', 'dateFound', 'status'];

export default function JobList() {
  const api = useApi();
  const { messages } = useWebSocket();
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('dateFound');
  const [sortAsc, setSortAsc] = useState(false);
  const [cvViewId, setCvViewId] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [runInProgress, setRunInProgress] = useState(false);
  const fetchDebounceRef = useRef(null);

  const handleApply = async (applicationId) => {
    setApplyingId(applicationId);
    try {
      await apiFetch(`/jobs/${applicationId}/apply`, { method: 'POST' });
      fetchJobs();
    } catch {}
    setApplyingId(null);
  };

  const fetchJobs = useCallback(async () => {
    const data = await api.get('/jobs');
    if (data) {
      setJobs(Array.isArray(data) ? data : data.jobs || []);
      setLastUpdated(new Date().toISOString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;

    if (last.type === 'agent:status' && last.status === 'running') {
      setRunInProgress(true);
    }
    if (last.type === 'agent:run_complete' || last.type === 'agent:run_error') {
      setRunInProgress(false);
      fetchJobs();
    }
    if (last.type === 'agent_log' && last.event === 'application_stored') {
      clearTimeout(fetchDebounceRef.current);
      fetchDebounceRef.current = setTimeout(() => fetchJobs(), 500);
    }
  }, [messages, fetchJobs]);

  useEffect(() => () => clearTimeout(fetchDebounceRef.current), []);

  const handleSort = (key) => {
    if (!SORT_KEYS.includes(key)) return;
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const handleStatusChange = async (jobId, newStatus) => {
    await api.patch(`/jobs/${jobId}/status`, { status: newStatus });
    fetchJobs();
  };

  const handleOpenLink = async (job) => {
    if (job.jobLink) window.open(job.jobLink, '_blank');
    await api.patch(`/jobs/${job.applicationId}/status`, { status: 'applied' });
    fetchJobs();
  };

  const filtered = jobs
    .filter((j) => filter === 'all' || j.status === filter)
    .filter((j) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (j.roleTitle || '').toLowerCase().includes(q) || (j.company || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'matchScore') { av = Number(av) || 0; bv = Number(bv) || 0; }
      if (sortKey === 'dateFound') { av = new Date(av || 0).getTime(); bv = new Date(bv || 0).getTime(); }
      if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.heading}>Job Applications</Text>
        {lastUpdated && (
          <Text style={styles.lastUpdated}>Last updated: {formatDateTime(lastUpdated)}</Text>
        )}
      </View>

      {runInProgress && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Pipeline running — new jobs will appear when scraping completes.</Text>
          <TouchableOpacity style={styles.bannerBtn} onPress={fetchJobs}>
            <Text style={styles.bannerBtnText}>Refresh now</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.filterBar}>
        <View style={styles.filterGroup}>
          {STATUS_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filter === s && styles.filterChipActive]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.filterChipText, filter === s && styles.filterChipTextActive]}>
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search title or company…"
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {api.loading && jobs.length === 0 ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◻</Text>
          <Text style={styles.emptyText}>No jobs found</Text>
          <Text style={styles.emptySubtext}>
            {jobs.length === 0 ? 'Run the agent pipeline to discover jobs' : 'Try adjusting your filters'}
          </Text>
        </View>
      ) : (
        <ScrollView horizontal style={styles.tableScroll}>
          <View>
            <View style={styles.tableHeader}>
              {[
                { key: 'status', label: 'Status', width: 110 },
                { key: 'title', label: 'Title', width: 250 },
                { key: 'company', label: 'Company', width: 160 },
                { key: 'source', label: 'Source', width: 100 },
                { key: 'matchScore', label: 'Match', width: 80 },
                { key: 'dateFound', label: 'Date Found', width: 120 },
                { key: null, label: 'Actions', width: 300 },
              ].map((col) => (
                <TouchableOpacity
                  key={col.label}
                  style={[styles.th, { width: col.width }]}
                  onPress={() => col.key && handleSort(col.key)}
                  disabled={!col.key}
                >
                  <Text style={styles.thText}>
                    {col.label}
                    {sortKey === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={styles.tableBody}>
              {filtered.map((job) => (
                <View key={job.applicationId} style={styles.row}>
                  <View style={[styles.td, { width: 110 }]}>
                    <View style={[styles.badge, { backgroundColor: statusColor(job.status, theme) + '22' }]}>
                      <Text style={[styles.badgeText, { color: statusColor(job.status, theme) }]}>
                        {(job.status || 'unknown').replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.td, { width: 250 }]}>
                    <Text style={styles.tdText}>{truncate(job.roleTitle, 40)}</Text>
                  </View>
                  <View style={[styles.td, { width: 160 }]}>
                    <Text style={styles.tdText}>{truncate(job.company, 25)}</Text>
                  </View>
                  <View style={[styles.td, { width: 100 }]}>
                    <Text style={styles.tdText}>{sourceIcon(job.source)} {job.source}</Text>
                  </View>
                  <View style={[styles.td, { width: 80 }]}>
                    <Text style={styles.tdText}>
                      {job.matchScore != null ? `${job.matchScore}` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.td, { width: 120 }]}>
                    <Text style={styles.tdTextMuted}>{formatDate(job.dateFound)}</Text>
                  </View>
                  <View style={[styles.td, styles.actionsCell, { width: 300 }]}>
                    {job.status === 'ready' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: theme.colors.primary + '33', borderColor: theme.colors.primary, borderWidth: 1 }]}
                        onPress={() => handleApply(job.applicationId)}
                        disabled={applyingId === job.applicationId}
                      >
                        <Text style={[styles.actionText, { color: theme.colors.primary }]}>
                          {applyingId === job.applicationId ? '...' : '▶ Apply'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {job.status === 'applying' && (
                      <View style={[styles.actionBtn, { backgroundColor: theme.colors.warning + '22' }]}>
                        <Text style={[styles.actionText, { color: theme.colors.warning }]}>Applying...</Text>
                      </View>
                    )}
                    {job.status === 'blocked' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: theme.colors.error + '22', borderColor: theme.colors.error, borderWidth: 1 }]}
                        onPress={() => window.location.href = '/interventions'}
                      >
                        <Text style={[styles.actionText, { color: theme.colors.error }]}>Action Required</Text>
                      </TouchableOpacity>
                    )}
                    {job.status === 'applied' && (
                      <View style={[styles.actionBtn, { backgroundColor: theme.colors.success + '22' }]}>
                        <Text style={[styles.actionText, { color: theme.colors.success }]}>✓ Applied</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setCvViewId(job.applicationId)}>
                      <Text style={styles.actionText}>View CV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenLink(job)}>
                      <Text style={styles.actionText}>Open ↗</Text>
                    </TouchableOpacity>
                    <View style={styles.statusDropdown}>
                      <select
                        value={job.status || ''}
                        onChange={(e) => handleStatusChange(job.applicationId, e.target.value)}
                        style={{
                          background: theme.colors.surfaceHover,
                          color: theme.colors.text,
                          border: `1px solid ${theme.colors.border}`,
                          borderRadius: theme.borderRadius.sm,
                          padding: '3px 6px',
                          fontSize: theme.fonts.xs,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        {STATUS_OPTIONS.filter((s) => s !== 'all').map((s) => (
                          <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {cvViewId && <CVViewer applicationId={cvViewId} onClose={() => setCvViewId(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  heading: {
    fontSize: theme.fonts.xxl,
    fontWeight: '700',
    color: theme.colors.text,
  },
  lastUpdated: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warning + '18',
    borderWidth: 1,
    borderColor: theme.colors.warning + '44',
    padding: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  bannerText: { fontSize: theme.fonts.sm, color: theme.colors.text, flex: 1 },
  bannerBtn: {
    backgroundColor: theme.colors.warning,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  bannerBtnText: { color: '#fff', fontWeight: '600', fontSize: theme.fonts.xs },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs + 1,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary + '22',
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    textTransform: 'capitalize',
  },
  filterChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs + 1,
    color: theme.colors.text,
    fontSize: theme.fonts.sm,
    minWidth: 200,
    outlineColor: theme.colors.primary,
  },
  tableScroll: { flex: 1 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.border,
  },
  th: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  thText: {
    fontSize: theme.fonts.xs,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableBody: { maxHeight: '65vh' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
  },
  td: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  tdText: {
    fontSize: theme.fonts.sm,
    color: theme.colors.text,
  },
  tdTextMuted: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textSecondary,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: theme.fonts.xs,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  actionsCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actionBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceHover,
  },
  actionText: {
    fontSize: theme.fonts.xs,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  statusDropdown: {},
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    fontSize: theme.fonts.lg,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
});
