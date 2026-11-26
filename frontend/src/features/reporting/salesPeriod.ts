export const REPORTING_ZONE = 'Asia/Ho_Chi_Minh';
export const MAX_PERIOD_DAYS = 1096;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const dayInMs = 86400000;

export type PeriodPreset = 'today' | 'last7' | 'last30' | 'month' | 'custom';
export const periodPresets: PeriodPreset[] = ['today', 'last7', 'last30', 'month', 'custom'];

export function isValidDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date in the reporting timezone as YYYY-MM-DD. */
export function reportingToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function shiftDate(value: string, days: number) {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * dayInMs).toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today = reportingToday()) {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'last7') return { from: shiftDate(today, -6), to: today };
  if (preset === 'last30') return { from: shiftDate(today, -29), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** The preset a range corresponds to, or custom. */
export function presetOf(from: string, to: string, today = reportingToday()): PeriodPreset {
  for (const preset of ['today', 'last7', 'last30', 'month'] as const) {
    const range = presetRange(preset, today);
    if (range.from === from && range.to === to) return preset;
  }
  return 'custom';
}

export type PeriodError = 'invalid' | 'reversed' | 'tooLong';

export function periodError(from: string, to: string): PeriodError | undefined {
  if (!isValidDate(from) || !isValidDate(to)) return 'invalid';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayInMs;
  if (days < 0) return 'reversed';
  if (days + 1 > MAX_PERIOD_DAYS) return 'tooLong';
  return undefined;
}

export function periodDays(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayInMs + 1;
}
