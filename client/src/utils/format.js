// The app's single canonical timezone is IST (Asia/Kolkata) — every
// timestamp is displayed in IST regardless of the viewer's own device
// timezone, matching how doctor working hours and booking times are
// interpreted end-to-end (see server/src/utils/scheduling.js).
export function formatDateTime(value) {
  if (!value) return '—';
  return `${new Date(value).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })} IST`;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
}

export const STATUS_TONE = {
  PENDING: 'amber',
  CONFIRMED: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'red',
  NO_SHOW: 'slate',
};

export const URGENCY_TONE = {
  LOW: 'green',
  MEDIUM: 'amber',
  HIGH: 'red',
};

export function safeParseJSON(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
