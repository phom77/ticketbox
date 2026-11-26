export const DEFAULT_PERFORMANCE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const fallbackTimeZones = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
];

type Resolution =
  | { ok: true; instant: string | null }
  | { ok: false; reason: 'invalid' | 'nonexistent' | 'ambiguous' };

export function getPerformanceTimeZones() {
  const { supportedValuesOf } = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  const available = supportedValuesOf?.('timeZone') ?? fallbackTimeZones;
  return [
    DEFAULT_PERFORMANCE_TIME_ZONE,
    'UTC',
    ...available.filter(
      (zone) => zone !== DEFAULT_PERFORMANCE_TIME_ZONE && zone !== 'Asia/Saigon' && zone !== 'UTC',
    ),
  ];
}

function wallTimeFormatter(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function wallTimeAsUtc(instant: number, formatter: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  const milliseconds = String(new Date(instant).getUTCMilliseconds()).padStart(3, '0');
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${milliseconds}Z`;
}

export function toPerformanceLocalDateTime(instant: string | null | undefined, timeZone: string) {
  if (!instant) return '';
  const timestamp = Date.parse(instant);
  const formatter = wallTimeFormatter(timeZone);
  if (!formatter || !Number.isFinite(timestamp)) return '';
  const iso = wallTimeAsUtc(timestamp, formatter);
  return iso
    .slice(0, -1)
    .replace(/(\.0+|(\.\d*[1-9])0+)$/, '$2')
    .replace(/:00$/, '');
}

export function resolvePerformanceDateTime(
  local: string,
  timeZone: string,
  previousInstant?: string | null,
): Resolution {
  if (!local) return { ok: true, instant: null };
  const match = LOCAL_DATE_TIME.exec(local);
  if (!match || match[1].startsWith('0000-')) return { ok: false, reason: 'invalid' };
  const [, minute, second = '00', fraction = ''] = match;
  const literal = `${minute}:${second}.${fraction.padEnd(3, '0')}Z`;
  const wallTime = Date.parse(literal);
  const formatter = wallTimeFormatter(timeZone);
  if (!formatter || !Number.isFinite(wallTime) || new Date(wallTime).toISOString() !== literal) {
    return { ok: false, reason: 'invalid' };
  }

  if (previousInstant) {
    const previous = Date.parse(previousInstant);
    if (Number.isFinite(previous) && wallTimeAsUtc(previous, formatter) === literal) {
      return { ok: true, instant: previousInstant };
    }
  }

  // Check the offsets on both sides of the wall time to detect clock changes.
  const samples = [wallTime - DAY_IN_MILLISECONDS, wallTime, wallTime + DAY_IN_MILLISECONDS];
  const matches = new Set<number>();
  for (const sample of samples) {
    const offset = Date.parse(wallTimeAsUtc(sample, formatter)) - sample;
    const candidate = wallTime - offset;
    if (Number.isFinite(candidate) && wallTimeAsUtc(candidate, formatter) === literal)
      matches.add(candidate);
  }
  if (matches.size === 0) return { ok: false, reason: 'nonexistent' };
  if (matches.size > 1) return { ok: false, reason: 'ambiguous' };
  return { ok: true, instant: new Date([...matches][0]).toISOString() };
}

export function formatPerformanceDateTime(
  instant: string | null | undefined,
  timeZone: string,
  locale?: string,
) {
  if (!instant) return '';
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

type PublishAtCheck =
  | { ok: true; instant: string }
  | { ok: false; reason: 'invalid' | 'nonexistent' | 'ambiguous' | 'past' | 'afterSaleStart' };

/** Resolves the release time in the performance's timezone and checks the window the review accepts. */
export function checkPublishAt(
  local: string,
  performance: { timezone: string; saleStartAt: string | null },
  now: number,
): PublishAtCheck {
  const resolved = resolvePerformanceDateTime(local, performance.timezone);
  if (!resolved.ok) return resolved;
  if (!resolved.instant) return { ok: false, reason: 'invalid' };
  const instant = Date.parse(resolved.instant);
  if (instant <= now) return { ok: false, reason: 'past' };
  const saleStart = Date.parse(performance.saleStartAt ?? '');
  if (Number.isFinite(saleStart) && instant > saleStart)
    return { ok: false, reason: 'afterSaleStart' };
  return { ok: true, instant: resolved.instant };
}
