/** Timezone-safe date utilities. Calendar dates are stored as YYYY-MM-DD strings
 *  and must NEVER be converted through UTC. All parsing uses explicit local date construction. */

export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayStr(): string {
  return localISO(new Date());
}

export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localISO(d);
}

export function dayOffsetStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localISO(d);
}

/** Parse a YYYY-MM-DD string into a local Date at midnight. Never uses UTC parsing. */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a YYYY-MM-DD date string according to the user's date format preference. */
export function formatDate(dateStr: string, format: string = 'DD-MM-YY'): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const yy = String(y).slice(2);
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  switch (format) {
    case 'MM/DD/YYYY': return `${mm}/${dd}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${mm}-${dd}`;
    case 'DD-MM-YY':
    default: return `${dd}-${mm}-${yy}`;
  }
}

/** Format a 24-hour time string (HH:MM) according to the user's time format preference. */
export function formatTime(time24: string, timeFormat: string = '12-hour'): string {
  if (timeFormat === '24-hour') return time24;
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayStr();
}
