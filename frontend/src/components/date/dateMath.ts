/** Calendar-day arithmetic on ISO dates (YYYY-MM-DD) that never depends on the browser time zone. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return toIsoDate(date) === value ? date : null;
}

export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = parseIsoDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Moves by calendar months and clamps the day, so 31 January plus one month is the last day of February. */
export function addMonths(value: string, months: number) {
  const date = parseIsoDate(value);
  if (!date) return value;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return toIsoDate(date);
}

/** 0 is Sunday. Vietnamese calendars start on Monday; other locales use the platform default. */
export function weekStart(locale: string) {
  if (locale.toLowerCase().startsWith('vi')) return 1;
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch {
    // Fall through to the default.
  }
  return 0;
}

export function weekdayOf(value: string) {
  return parseIsoDate(value)?.getUTCDay() ?? 0;
}

/** The days of the month grid, padded with the neighbouring months to whole weeks. */
export function monthGrid(month: string, firstDay: number) {
  const first = `${month.slice(0, 7)}-01`;
  const lead = (weekdayOf(first) - firstDay + 7) % 7;
  const start = addDays(first, -lead);
  const next = addMonths(first, 1);
  const length = Math.ceil((lead + (Date.parse(next) - Date.parse(first)) / 86_400_000) / 7) * 7;
  return Array.from({ length }, (_, index) => addDays(start, index));
}

export function formatDay(value: string, locale: string, options: Intl.DateTimeFormatOptions) {
  const date = parseIsoDate(value);
  return date
    ? new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date)
    : value;
}

/** The numeric date format used for typing: dd/MM/yyyy for Vietnamese, MM/dd/yyyy for English. */
export function typedDateOrder(locale: string) {
  return locale.toLowerCase().startsWith('vi') ? 'dmy' : 'mdy';
}

export function formatTypedDate(value: string, locale: string) {
  const date = parseIsoDate(value);
  if (!date) return '';
  const [year, month, day] = value.split('-');
  return typedDateOrder(locale) === 'dmy' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

/** Parses a typed date in the locale order; ISO dates are accepted too. Returns '' when it is not a real date. */
export function parseTypedDate(text: string, locale: string) {
  const value = text.trim();
  if (parseIsoDate(value)) return value;
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (!match) return '';
  const [first, second] = [match[1].padStart(2, '0'), match[2].padStart(2, '0')];
  const iso =
    typedDateOrder(locale) === 'dmy'
      ? `${match[3]}-${second}-${first}`
      : `${match[3]}-${first}-${second}`;
  return parseIsoDate(iso) ? iso : '';
}

/** Formats HH:mm for display: 24-hour for Vietnamese, the 12-hour clock for English. */
export function formatTime(value: string, locale: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  if (locale.toLowerCase().startsWith('vi')) return value;
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Parses 24-hour HH:mm, H:mm, HHmm or a 12-hour time with AM or PM; returns HH:mm or ''. */
export function parseTime(text: string) {
  const match = /^(\d{1,2})(?::?(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(text.trim());
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3]?.[0].toLowerCase();
  if (minute > 59) return '';
  if (meridiem) {
    if (hour < 1 || hour > 12) return '';
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  } else if (hour > 23) {
    return '';
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const timeSteps = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});
