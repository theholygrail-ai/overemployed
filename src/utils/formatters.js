const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${minutes} ${ampm}`;
}

export function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

export function truncate(str, len = 60) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

const STATUS_COLORS = {
  found: 'warning',
  cv_generated: 'primary',
  reviewed: 'primaryHover',
  ready: 'success',
  applying: 'warning',
  blocked: 'error',
  applied: 'success',
  failed: 'error',
  rejected: 'error',
};

export function statusColor(status, theme) {
  const key = STATUS_COLORS[status] || 'textMuted';
  return theme.colors[key] || theme.colors.textMuted;
}

const SOURCE_ICONS = {
  linkedin: '🔗',
  adzuna: '🔍',
  remotive: '🌍',
  remoteok: '💻',
};

export function sourceIcon(source) {
  return SOURCE_ICONS[(source || '').toLowerCase()] || '📋';
}
