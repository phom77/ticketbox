export type TimezoneOption = { value: string; label: string };

const fallback = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Jakarta',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

function offset(zone: string, at: Date) {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((item) => item.type === 'timeZoneName')?.value;
    if (!part) return '';
    return part === 'GMT' ? 'UTC' : part.replace('GMT', 'UTC');
  } catch {
    return '';
  }
}

/** IANA zones with their current UTC offset, so an organizer can recognise their own. */
export function timezoneOptions(selected?: string, at = new Date()): TimezoneOption[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  const zones = new Set<string>(supported ? supported('timeZone') : fallback);
  zones.add('UTC');
  if (selected) zones.add(selected);
  return [...zones]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: `${value} (${offset(value, at)})` }));
}

export function filterTimezones(options: TimezoneOption[], term: string, selected: string) {
  const needle = term.trim().toLowerCase().replace(/ /g, '_');
  if (!needle) return options;
  return options.filter(
    (option) => option.value === selected || option.label.toLowerCase().includes(needle),
  );
}
