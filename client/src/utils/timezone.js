/**
 * Timezone formatting utilities using native Intl API.
 * All functions expect UTC datetime strings from the MySQL backend
 * (format: "2026-03-15 20:00:00" or ISO "2026-03-15T20:00:00Z").
 */

/** Parse a MySQL UTC datetime string into a JS Date object. */
export function utcToDate(utcDateStr) {
  if (!utcDateStr) return null;
  const isoStr = utcDateStr.includes('T') ? utcDateStr : utcDateStr.replace(' ', 'T') + 'Z';
  return new Date(isoStr);
}

/** Format full date + time, e.g. "Mar 15, 8:00 PM" */
export function formatEventTime(utcDateStr, timezone) {
  const date = utcToDate(utcDateStr);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Format date only, e.g. "Sat, Mar 15, 2026" */
export function formatEventDate(utcDateStr, timezone) {
  const date = utcToDate(utcDateStr);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** Format time only, e.g. "8:00 PM" */
export function formatEventTimeOnly(utcDateStr, timezone) {
  const date = utcToDate(utcDateStr);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Get timezone abbreviation at a given date, e.g. "EST", "CDT" */
export function getTimezoneAbbr(utcDateStr, timezone) {
  const date = utcToDate(utcDateStr);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short',
  }).formatToParts(date);
  return parts.find((p) => p.type === 'timeZoneName')?.value || '';
}

/** Convert a UTC datetime string to a datetime-local input value in the given timezone. */
export function utcToLocalInput(utcDateStr, timezone) {
  if (!utcDateStr) return '';
  const date = utcToDate(utcDateStr);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Get IANA timezone list for dropdowns. */
export function getTimezoneOptions() {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone');
  }
  return [
    'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
    'Pacific/Honolulu', 'Europe/London', 'Europe/Berlin',
    'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
  ];
}
