import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectSaleDraft } from '../src/pages/organizer/performanceSaleReview.ts';

const performance = { saleStartAt: '2027-06-01T00:00:00Z', saleEndAt: '2027-06-20T00:00:00Z' };
const now = Date.parse(performance.saleStartAt);
const standing = {
  id: 'floor',
  sectionId: null,
  sectionLabel: 'Floor',
  kind: 'GA',
  capacity: 100,
  seats: [],
};
const vip = {
  id: 'vip',
  sectionId: 'balcony',
  sectionLabel: 'Balcony',
  kind: 'ASSIGNED',
  capacity: 1,
  seats: [{ id: '1', blocked: false }],
};
const standard = {
  id: 'standard',
  groupId: 'floor',
  name: 'Standard',
  price: 250000,
  active: true,
  ...performance,
};
const reserved = { ...standard, id: 'reserved', groupId: 'vip', price: 500000 };
const balcony = {
  id: 'balcony',
  label: 'Balcony',
  kind: 'ASSIGNED',
  rows: [
    {
      seats: [
        { id: '1', blocked: false },
        { id: '2', blocked: true },
      ],
    },
  ],
};

test('mapless GA can publish directly from saved tickets', () => {
  const result = inspectSaleDraft(
    null,
    { groups: [standing], offers: [standard] },
    performance,
    now,
  );
  assert.deepEqual(result, { saveIssue: null, publishIssues: [] });
});

test('a draft can be saved without an active offer but needs one to publish', () => {
  const result = inspectSaleDraft(
    null,
    { groups: [standing], offers: [{ ...standard, active: false }] },
    performance,
    now,
  );
  assert.deepEqual(result, { saveIssue: null, publishIssues: ['reviewMissingOffer'] });
});

test('blocked seats need no assignment; unassigned sellable seats block publication only', () => {
  const sale = { groups: [vip], offers: [reserved] };
  assert.deepEqual(
    inspectSaleDraft({ sections: [balcony] }, sale, performance, now).publishIssues,
    [],
  );
  const incomplete = {
    ...balcony,
    rows: [{ seats: [...balcony.rows[0].seats, { id: '3', blocked: false }] }],
  };
  assert.deepEqual(inspectSaleDraft({ sections: [incomplete] }, sale, performance, now), {
    saveIssue: null,
    publishIssues: ['reviewUnassignedSeats'],
  });
});

test('layout replacements and invalid offer details must be repaired before saving', () => {
  assert.equal(
    inspectSaleDraft(
      { sections: [balcony] },
      { groups: [standing], offers: [standard] },
      performance,
      now,
    ).saveIssue,
    'reviewMapMismatch',
  );
  assert.equal(
    inspectSaleDraft(
      null,
      { groups: [standing], offers: [{ ...standard, price: 0 }] },
      performance,
      now,
    ).saveIssue,
    'reviewInvalidOffer',
  );
  assert.equal(
    inspectSaleDraft(
      null,
      { groups: [standing], offers: [{ ...standard, saleStartAt: '2027-05-28T03:00:00Z' }] },
      performance,
      now,
    ).saveIssue,
    'offerWindowOutsidePerformance',
  );
});

test('an ended sale window requires the organizer to edit the schedule before publication', () => {
  const result = inspectSaleDraft(
    null,
    { groups: [standing], offers: [standard] },
    performance,
    Date.parse(performance.saleEndAt),
  );
  assert.deepEqual(result, { saveIssue: null, publishIssues: ['reviewSaleEnded'] });
});
