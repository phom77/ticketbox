import {
  resolvePerformanceDateTime,
  toPerformanceLocalDateTime,
} from '../../pages/organizer/performanceDateTime';

export const salePresets = ['whole', 'early', 'final', 'later', 'custom'] as const;
export type SalePreset = (typeof salePresets)[number];
export type SaleWindow = { saleStartAt: string; saleEndAt: string };
export type PerformanceSaleWindow = SaleWindow & { timezone: string };
export type PresetInput = { date?: string; days?: number };
export type PresetResult =
  | { ok: true; window: SaleWindow }
  | { ok: false; reason: 'empty' | 'invalid' };

export const defaultFinalDays = 7;
export const maxFinalDays = 30;

const dayMs = 24 * 60 * 60 * 1000;

/** Calendar date (yyyy-mm-dd) of an instant in the venue timezone. */
export function venueDate(instant: string, timezone: string) {
  return toPerformanceLocalDateTime(instant, timezone).slice(0, 10);
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * dayMs).toISOString().slice(0, 10);
}

function dayDifference(later: string, earlier: string) {
  return Math.round(
    (Date.parse(later + 'T00:00:00Z') - Date.parse(earlier + 'T00:00:00Z')) / dayMs,
  );
}

function resolve(local: string, timezone: string) {
  const result = resolvePerformanceDateTime(local, timezone);
  return result.ok ? result.instant : null;
}

/** Computes the ticket type window for a preset, inside the performance sale window, in the venue timezone. */
export function applyPreset(
  preset: SalePreset,
  performance: PerformanceSaleWindow,
  input: PresetInput = {},
): PresetResult {
  const { saleStartAt: from, saleEndAt: to, timezone } = performance;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  let start = from;
  let end = to;
  if (preset === 'early') {
    const instant = input.date ? resolve(input.date + 'T23:59', timezone) : null;
    if (!instant) return { ok: false, reason: 'invalid' };
    end = Date.parse(instant) > toMs ? to : instant;
  } else if (preset === 'final') {
    const days = input.days ?? defaultFinalDays;
    if (!Number.isInteger(days) || days < 1 || days > maxFinalDays) {
      return { ok: false, reason: 'invalid' };
    }
    const instant = resolve(shiftDate(venueDate(to, timezone), -days) + 'T00:00', timezone);
    if (!instant) return { ok: false, reason: 'invalid' };
    start = Date.parse(instant) < fromMs ? from : instant;
  } else if (preset === 'later') {
    const instant = input.date ? resolve(input.date, timezone) : null;
    if (!instant) return { ok: false, reason: 'invalid' };
    start = Date.parse(instant) < fromMs ? from : instant;
  } else if (preset === 'custom') {
    return { ok: false, reason: 'invalid' };
  }
  if (
    !(Date.parse(start) < Date.parse(end)) ||
    Date.parse(start) >= toMs ||
    Date.parse(end) <= fromMs
  ) {
    return { ok: false, reason: 'empty' };
  }
  return { ok: true, window: { saleStartAt: start, saleEndAt: end } };
}

/** The preset whose rule produces the stored window, otherwise custom. */
export function detectPreset(
  window: SaleWindow,
  performance: PerformanceSaleWindow,
): { preset: SalePreset } & PresetInput {
  const { timezone } = performance;
  const sameStart = Date.parse(window.saleStartAt) === Date.parse(performance.saleStartAt);
  const sameEnd = Date.parse(window.saleEndAt) === Date.parse(performance.saleEndAt);
  if (sameStart && sameEnd) return { preset: 'whole' };
  const localStart = toPerformanceLocalDateTime(window.saleStartAt, timezone);
  const localEnd = toPerformanceLocalDateTime(window.saleEndAt, timezone);
  if (sameStart && localEnd.endsWith('T23:59')) {
    return { preset: 'early', date: localEnd.slice(0, 10) };
  }
  if (sameEnd && localStart.endsWith('T00:00')) {
    const days = dayDifference(venueDate(performance.saleEndAt, timezone), localStart.slice(0, 10));
    if (days >= 1 && days <= maxFinalDays) return { preset: 'final', days };
  }
  if (sameEnd) return { preset: 'later', date: localStart };
  return { preset: 'custom' };
}

/** One line such as "1 Dec, 10:00 – 15 Dec, 23:59 (Asia/Ho_Chi_Minh)". */
export function summarizeWindow(window: SaleWindow, timezone: string, locale?: string) {
  const format = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${format.format(Date.parse(window.saleStartAt))} – ${format.format(Date.parse(window.saleEndAt))} (${timezone})`;
}
