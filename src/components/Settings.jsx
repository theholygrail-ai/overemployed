import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import theme from '../theme';
import { apiFetch } from '../config.js';

function useLocalStorage(key, defaultValue = '') {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) || defaultValue; } catch { return defaultValue; }
  });
  const save = (v) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* noop */ }
  };
  return [value, save];
}

export default function Settings() {
  const [groqKey, setGroqKey] = useLocalStorage('groq_api_key');
  const [adzunaId, setAdzunaId] = useLocalStorage('adzuna_app_id');
  const [adzunaKey, setAdzunaKey] = useLocalStorage('adzuna_app_key');
  const [keywords, setKeywords] = useLocalStorage('search_keywords');
  const [location, setLocation] = useLocalStorage('search_location');
  const [filters, setFilters] = useLocalStorage('search_filters');
  const [showGroq, setShowGroq] = useState(false);
  const [showAdzKey, setShowAdzKey] = useState(false);
  const [showLiCookie, setShowLiCookie] = useState(false);
  const [liCookie, setLiCookie] = useState('');
  const [liSaved, setLiSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkedIn, setLinkedIn] = useState({ connected: false });

  useEffect(() => {
    apiFetch('/auth/linkedin/status')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setLinkedIn(data);
          if (data.hasCookie) setLiCookie('••••••••••••');
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveLiCookie = async () => {
    if (!liCookie || liCookie === '••••••••••••') return;
    try {
      const res = await apiFetch('/auth/linkedin/cookie', {
        method: 'POST',
        body: JSON.stringify({ cookie: liCookie }),
      });
      if (res.ok) {
        setLiSaved(true);
        setLinkedIn(prev => ({ ...prev, connected: true, hasCookie: true }));
        setLiCookie('••••••••••••');
        setTimeout(() => setLiSaved(false), 2000);
      }
    } catch {}
  };

  const handleDisconnectLinkedIn = async () => {
    await apiFetch('/auth/linkedin', { method: 'DELETE' });
    setLinkedIn({ connected: false });
    setLiCookie('');
    setLiSaved(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.subheading}>API keys and search configuration</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Groq API Key</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={groqKey}
            onChangeText={setGroqKey}
            placeholder="gsk_..."
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showGroq}
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowGroq(!showGroq)}>
            <Text style={styles.toggleBtnText}>{showGroq ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Adzuna Credentials</Text>
        <Text style={styles.label}>App ID</Text>
        <TextInput
          style={styles.input}
          value={adzunaId}
          onChangeText={setAdzunaId}
          placeholder="Your Adzuna App ID"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>App Key</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={adzunaKey}
            onChangeText={setAdzunaKey}
            placeholder="Your Adzuna App Key"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showAdzKey}
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowAdzKey(!showAdzKey)}>
            <Text style={styles.toggleBtnText}>{showAdzKey ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>LinkedIn Session</Text>
        <View style={[styles.linkedInRow, { marginBottom: theme.spacing.sm }]}>
          <View style={[styles.statusDot, { backgroundColor: linkedIn.connected ? theme.colors.success : theme.colors.textMuted }]} />
          <Text style={styles.linkedInStatus}>
            {linkedIn.connected ? 'Connected (cookie set)' : 'Not connected'}
          </Text>
          {linkedIn.connected && (
            <TouchableOpacity style={[styles.toggleBtn, { borderColor: theme.colors.error }]} onPress={handleDisconnectLinkedIn}>
              <Text style={[styles.toggleBtnText, { color: theme.colors.error }]}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.label}>li_at Cookie (from browser DevTools &gt; Application &gt; Cookies &gt; linkedin.com)</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1, fontFamily: 'monospace', fontSize: theme.fonts.xs }]}
            value={liCookie}
            onChangeText={setLiCookie}
            placeholder="AQEFAHQBAAAAABs3kXg..."
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={!showLiCookie}
            onFocus={() => { if (liCookie === '••••••••••••') setLiCookie(''); }}
          />
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowLiCookie(!showLiCookie)}>
            <Text style={styles.toggleBtnText}>{showLiCookie ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.connectBtn, { marginTop: theme.spacing.sm, alignSelf: 'flex-start' }]}
          onPress={handleSaveLiCookie}
        >
          <Text style={styles.connectBtnText}>{liSaved ? '✓ Saved' : 'Save Cookie'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Job Search Criteria</Text>

        <Text style={styles.label}>Keywords (comma-separated)</Text>
        <TextInput
          style={styles.input}
          value={keywords}
          onChangeText={setKeywords}
          placeholder="React, Node.js, Full Stack, Senior Developer"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="Remote, US, New York"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Filters</Text>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          value={filters}
          onChangeText={setFilters}
          placeholder="e.g. salary_min=100000, remote=true"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40, maxWidth: 600 },
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
  label: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs,
    fontWeight: '500',
  },
  input: {
    backgroundColor: theme.colors.surfaceHover,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fonts.md,
    outlineColor: theme.colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  toggleBtn: {
    backgroundColor: theme.colors.surfaceHover,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtnText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  linkedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  linkedInStatus: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    flex: 1,
  },
  connectBtn: {
    backgroundColor: '#0a66c2',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  connectBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.sm,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: theme.fonts.md,
  },
});
