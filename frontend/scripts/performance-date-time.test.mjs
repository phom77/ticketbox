import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PERFORMANCE_TIME_ZONE,
  formatPerformanceDateTime,
  getPerformanceTimeZones,
  resolvePerformanceDateTime,
  toPerformanceLocalDateTime,
} from '../src/pages/organizer/performanceDateTime.ts';

test('schedules and reopens a concert at Vietnam wall time', () => {
  const local = '2027-06-20T19:30';
  const instant = '2027-06-20T12:30:00.000Z';
  assert.deepEqual(resolvePerformanceDateTime(local, DEFAULT_PERFORMANCE_TIME_ZONE), {
    ok: true,
    instant,
  });
  assert.equal(toPerformanceLocalDateTime(instant, DEFAULT_PERFORMANCE_TIME_ZONE), local);
  assert.match(formatPerformanceDateTime(instant, DEFAULT_PERFORMANCE_TIME_ZONE, 'vi-VN'), /19:30/);
  assert.equal(getPerformanceTimeZones()[0], DEFAULT_PERFORMANCE_TIME_ZONE);
});

test('checks daylight saving gaps and repetitions without guessing an instant', () => {
  assert.deepEqual(resolvePerformanceDateTime('2027-03-14T02:30', 'America/New_York'), {
    ok: false,
    reason: 'nonexistent',
  });
  assert.deepEqual(resolvePerformanceDateTime('2027-11-07T01:30', 'America/New_York'), {
    ok: false,
    reason: 'ambiguous',
  });
  assert.deepEqual(resolvePerformanceDateTime('2027-03-14T03:30', 'America/New_York'), {
    ok: true,
    instant: '2027-03-14T07:30:00.000Z',
  });
  assert.deepEqual(resolvePerformanceDateTime('2027-10-03T02:15', 'Australia/Lord_Howe'), {
    ok: false,
    reason: 'nonexistent',
  });
});

test('an unchanged stored time keeps the resolved occurrence and its precision', () => {
  const stored = '2027-11-07T06:30:00.123456Z';
  const local = toPerformanceLocalDateTime(stored, 'America/New_York');
  assert.equal(local, '2027-11-07T01:30:00.123');
  assert.deepEqual(resolvePerformanceDateTime(local, 'America/New_York', stored), {
    ok: true,
    instant: stored,
  });
});

test('handles empty fields and rejects impossible dates and unknown zones', () => {
  assert.deepEqual(resolvePerformanceDateTime('', 'UTC'), { ok: true, instant: null });
  assert.deepEqual(resolvePerformanceDateTime('2027-02-29T19:30', 'UTC'), {
    ok: false,
    reason: 'invalid',
  });
  assert.deepEqual(resolvePerformanceDateTime('2027-06-20T19:30', 'Invalid/Zone'), {
    ok: false,
    reason: 'invalid',
  });
  assert.equal(toPerformanceLocalDateTime(null, 'UTC'), '');
});
