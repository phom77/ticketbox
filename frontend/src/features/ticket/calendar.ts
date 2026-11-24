export type CalendarEvent = {
  uid: string;
  title: string;
  start: string;
  venue?: string;
  description?: string;
  /** Concert length is not published, so the entry covers a typical show. */
  durationHours?: number;
  now?: Date;
};

function stamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/** Builds a single-event iCalendar file, or null when the start time is not a valid date. */
export function buildIcs(event: CalendarEvent) {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + (event.durationHours ?? 3) * 3_600_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TicketBox//Tickets//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}@ticketbox`,
    `DTSTAMP:${stamp(event.now ?? new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.venue ? [`LOCATION:${escapeText(event.venue)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

export function downloadIcs(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
