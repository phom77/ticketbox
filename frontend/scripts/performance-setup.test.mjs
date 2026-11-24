import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  canPriceSellingModel,
  getSaleSetup,
  performanceStatusKey,
} from '../src/pages/organizer/performanceSetup.ts';

const emptySale = { groups: [], offers: [] };
const standing = { id: 'floor', kind: 'GA', rows: [] };
const reserved = {
  id: 'circle',
  kind: 'ASSIGNED',
  rows: [
    {
      seats: [
        { id: 'A1', blocked: false },
        { id: 'A2', blocked: false },
        { id: 'A3', blocked: true },
      ],
    },
  ],
};
const group = {
  id: 'tier',
  sectionId: reserved.id,
  kind: 'ASSIGNED',
  seats: [
    { id: 'A1', blocked: false },
    { id: 'A3', blocked: true },
  ],
};

test('distinguishes a new draft, a mapless show, and each built seating model', () => {
  assert.equal(getSaleSetup(null, emptySale).model, null);
  assert.equal(getSaleSetup({ sections: [] }, emptySale).model, null);
  assert.equal(
    getSaleSetup(null, { groups: [{ sectionId: null, kind: 'GA', seats: [] }], offers: [] }).model,
    'admission',
  );
  assert.equal(getSaleSetup({ sections: [standing] }, emptySale).model, 'zones');
  assert.equal(getSaleSetup({ sections: [reserved] }, emptySale).model, 'reserved');
  assert.equal(getSaleSetup({ sections: [standing, reserved] }, emptySale).model, 'mixed');
});

test('counts only assignable mapped seats and ignores obsolete assignments', () => {
  const sale = {
    groups: [group, { ...group, sectionId: 'removed', seats: [{ id: 'A2', blocked: false }] }],
    offers: [
      { id: 'active', active: true },
      { id: 'inactive', active: false },
    ],
  };
  assert.deepEqual(getSaleSetup({ sections: [standing, reserved] }, sale), {
    model: 'mixed',
    sectionCount: 2,
    zoneCount: 1,
    seatCount: 2,
    unassignedSeats: 1,
    activeOffers: 1,
    orphanedPools: 1,
  });
});

test('identifies published show state using the actual sales window', () => {
  const show = {
    status: 'ON_SALE',
    salesSuspended: false,
    saleStartAt: '2026-01-01T08:00:00Z',
    saleEndAt: '2026-01-01T12:00:00Z',
  };
  assert.equal(
    performanceStatusKey(show, Date.parse('2026-01-01T06:00:00Z')),
    'performances:setupStatusScheduled',
  );
  assert.equal(
    performanceStatusKey(show, Date.parse('2026-01-01T10:00:00Z')),
    'performances:setupStatusSelling',
  );
  assert.equal(
    performanceStatusKey(show, Date.parse('2026-01-01T12:00:00Z')),
    'performances:setupStatusClosed',
  );
  assert.equal(
    performanceStatusKey({ ...show, salesSuspended: true }, Date.parse('2026-01-01T10:00:00Z')),
    'performances:setupStatusPaused',
  );
  assert.equal(
    performanceStatusKey({ ...show, status: 'CANCELLED', salesSuspended: true }, Date.now()),
    'performances:setupStatusCancelled',
  );
});

test('requires the intended geometry while a selling model is explicitly selected', () => {
  const stagedZones = getSaleSetup({ sections: [standing] }, emptySale);
  const stagedSeats = getSaleSetup({ sections: [reserved] }, emptySale);
  const mixed = getSaleSetup({ sections: [standing, reserved] }, emptySale);
  const unsellable = getSaleSetup({ sections: [standing, { ...reserved, rows: [] }] }, emptySale);

  assert.equal(canPriceSellingModel('zones', true, stagedZones), true);
  assert.equal(canPriceSellingModel('mixed', true, stagedZones), false);
  assert.equal(canPriceSellingModel('mixed', true, stagedSeats), false);
  assert.equal(canPriceSellingModel('mixed', true, mixed), true);
  assert.equal(canPriceSellingModel('zones', true, mixed), false);
  assert.equal(canPriceSellingModel('reserved', true, mixed), false);
  assert.equal(canPriceSellingModel('mixed', true, unsellable), false);
  assert.equal(canPriceSellingModel('admission', true, stagedZones), false);
  assert.equal(canPriceSellingModel('admission', false, getSaleSetup(null, emptySale)), true);
});
