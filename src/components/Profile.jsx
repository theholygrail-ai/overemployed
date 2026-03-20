import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import theme from '../theme';
import { apiFetch } from '../config.js';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function Profile() {
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    linkedinUrl: '',
  });
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiFetch('/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          linkedinUrl: data.linkedinUrl || '',
        });
      }
    } catch {
      setError('Failed to load profile');
    }
  }, []);

  const fetchArtifacts = useCallback(async () => {
    try {
      const res = await apiFetch('/profile/artifacts');
      if (res.ok) {
        const data = await res.json();
        setArtifacts(data);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchProfile(), fetchArtifacts()]).finally(() => setLoading(false));
  }, [fetchProfile, fetchArtifacts]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError('Failed to save profile');
      }
    } catch {
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (filename) => {
    try {
      const res = await apiFetch(`/profile/artifacts/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setArtifacts((prev) => prev.filter((a) => a.filename !== filename));
      }
    } catch {
      setError('Failed to delete artifact');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadSuccess(false);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await apiFetch('/profile/artifacts', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2500);
        await fetchArtifacts();
      } else {
        setError('Upload failed');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.subheading}>Your personal details and uploaded artifacts</Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Personal Information</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={profile.name}
          onChangeText={(v) => setProfile((p) => ({ ...p, name: v }))}
          placeholder="Full name"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Email</Text>
        <TextInput
          style={styles.input}
          value={profile.email}
          onChangeText={(v) => setProfile((p) => ({ ...p, email: v }))}
          placeholder="you@example.com"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="email-address"
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Phone</Text>
        <TextInput
          style={styles.input}
          value={profile.phone}
          onChangeText={(v) => setProfile((p) => ({ ...p, phone: v }))}
          placeholder="+1 (555) 000-0000"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="phone-pad"
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>Address</Text>
        <TextInput
          style={styles.input}
          value={profile.address}
          onChangeText={(v) => setProfile((p) => ({ ...p, address: v }))}
          placeholder="City, State, Country"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>LinkedIn URL</Text>
        <TextInput
          style={styles.input}
          value={profile.linkedinUrl}
          onChangeText={(v) => setProfile((p) => ({ ...p, linkedinUrl: v }))}
          placeholder="https://linkedin.com/in/yourname"
          placeholderTextColor={theme.colors.textMuted}
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile'}
        </Text>
      </TouchableOpacity>

      <View style={[styles.card, { marginTop: theme.spacing.lg }]}>
        <Text style={styles.sectionTitle}>Uploaded Artifacts</Text>

        {artifacts.length === 0 ? (
          <Text style={styles.emptyText}>No artifacts uploaded yet.</Text>
        ) : (
          artifacts.map((artifact) => (
            <View key={artifact.filename} style={styles.artifactRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.artifactName}>{artifact.filename}</Text>
                <Text style={styles.artifactSize}>{formatFileSize(artifact.size)}</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(artifact.filename)}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={styles.uploadArea}>
          {uploading ? (
            <View style={styles.uploadStatus}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.uploadStatusText, { color: theme.colors.primary }]}>
                Uploading…
              </Text>
            </View>
          ) : uploadSuccess ? (
            <View style={styles.uploadStatus}>
              <Text style={[styles.uploadStatusText, { color: theme.colors.success }]}>
                ✓ Uploaded successfully
              </Text>
            </View>
          ) : (
            <View style={styles.uploadStatus}>
              <Text style={styles.uploadHint}>Drop a file or click to upload</Text>
            </View>
          )}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
            }}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 40, maxWidth: 600 },
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
  errorBanner: {
    backgroundColor: theme.colors.error + '18',
    borderWidth: 1,
    borderColor: theme.colors.error + '44',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fonts.sm,
    flex: 1,
  },
  errorDismiss: {
    color: theme.colors.error,
    fontSize: theme.fonts.md,
    paddingHorizontal: theme.spacing.sm,
    fontWeight: '700',
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
  emptyText: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.sm,
  },
  artifactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border + '44',
  },
  artifactName: {
    fontSize: theme.fonts.md,
    color: theme.colors.text,
    fontWeight: '500',
  },
  artifactSize: {
    fontSize: theme.fonts.xs,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  deleteBtn: {
    backgroundColor: theme.colors.error + '18',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.error + '44',
  },
  deleteBtnText: {
    color: theme.colors.error,
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  uploadArea: {
    marginTop: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 80,
  },
  uploadStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  uploadStatusText: {
    fontSize: theme.fonts.sm,
    fontWeight: '600',
  },
  uploadHint: {
    fontSize: theme.fonts.sm,
    color: theme.colors.textMuted,
  },
});
