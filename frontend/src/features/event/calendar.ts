const pad = (value: number) => String(value).padStart(2, '0');

function icsTime(value: string) {
  const date = new Date(value);
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

const escapeText = (text: string) =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

/** Folds a content line at 75 octets-ish (characters) as RFC 5545 asks. */
function fold(line: string) {
  const parts: string[] = [];
  for (let index = 0; index < line.length; index += 74) parts.push(line.slice(index, index + 74));
  return parts.join('\r\n ');
}

export type CalendarEvent = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

export function buildIcs(event: CalendarEvent, stamp = new Date()) {
  const end =
    event.endsAt && Date.parse(event.endsAt) > Date.parse(event.startsAt)
      ? event.endsAt
      : new Date(Date.parse(event.startsAt) + 3 * 3_600_000).toISOString();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TicketBox//Event//EN',
    'BEGIN:VEVENT',
    'UID:' + event.uid + '@ticketbox',
    'DTSTAMP:' + icsTime(stamp.toISOString()),
    'DTSTART:' + icsTime(event.startsAt),
    'DTEND:' + icsTime(end),
    'SUMMARY:' + escapeText(event.title),
    event.location ? 'LOCATION:' + escapeText(event.location) : '',
    event.description ? 'DESCRIPTION:' + escapeText(event.description) : '',
    event.url ? 'URL:' + event.url : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(event: CalendarEvent, filename = 'event.ics') {
  const url = URL.createObjectURL(
    new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
