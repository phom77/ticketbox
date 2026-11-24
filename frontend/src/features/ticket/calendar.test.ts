import { describe, expect, it } from 'vitest';
import { buildIcs } from './calendar';

describe('buildIcs', () => {
  it('writes UTC times, escapes text and uses CRLF line endings', () => {
    const ics = buildIcs({
      uid: 't1',
      title: 'Live, Loud; Proud',
      start: '2026-12-01T12:00:00Z',
      venue: 'Hall A',
      now: new Date('2026-11-24T00:00:00Z'),
    })!;
    expect(ics).toContain('DTSTART:20261201T120000Z');
    expect(ics).toContain('DTEND:20261201T150000Z');
    expect(ics).toContain('SUMMARY:Live\\, Loud\\; Proud');
    expect(ics).toContain('LOCATION:Hall A');
    expect(ics.split('\r\n').length).toBeGreaterThan(8);
  });

  it('returns null for an unknown start time', () => {
    expect(buildIcs({ uid: 'x', title: 'x', start: '' })).toBeNull();
  });
});
