import type { DraftLayout, ManagedPerformance, SaleDraft } from '../../api/performanceManagement';

export const sellingModels = ['admission', 'zones', 'reserved', 'mixed'] as const;
export type SellingModel = (typeof sellingModels)[number];

export const sellingModelLabels = {
  admission: 'performances:sellingModelAdmission',
  zones: 'performances:sellingModelZones',
  reserved: 'performances:sellingModelReserved',
  mixed: 'performances:sellingModelMixed',
} satisfies Record<SellingModel, string>;

export function getSaleSetup(layout: DraftLayout | null, sale: SaleDraft) {
  const sections = layout?.sections ?? [];
  const sectionKinds = new Map(sections.map((section) => [section.id, section.kind]));
  const zoneCount = sections.filter((section) => section.kind === 'GA').length;
  const seatSections = sections.filter((section) => section.kind === 'ASSIGNED');
  const assignedSeats = new Set<string>();
  let orphanedPools = 0;
  for (const group of sale.groups) {
    if (
      group.sectionId
        ? sectionKinds.get(group.sectionId) === group.kind
        : !layout && group.kind === 'GA'
    ) {
      for (const seat of group.seats) assignedSeats.add(seat.id);
    } else {
      orphanedPools += 1;
    }
  }

  let seatCount = 0;
  let unassignedSeats = 0;
  for (const section of seatSections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        if (seat.blocked) continue;
        seatCount += 1;
        if (!assignedSeats.has(seat.id)) unassignedSeats += 1;
      }
    }
  }

  const model: SellingModel | null =
    zoneCount && seatSections.length
      ? 'mixed'
      : zoneCount
        ? 'zones'
        : seatSections.length
          ? 'reserved'
          : sale.groups.some((group) => group.kind === 'GA' && !group.sectionId)
            ? 'admission'
            : null;

  return {
    model,
    sectionCount: sections.length,
    zoneCount,
    seatCount,
    unassignedSeats,
    activeOffers: sale.offers.filter((offer) => offer.active).length,
    orphanedPools,
  };
}

export function canPriceSellingModel(
  selected: SellingModel | null,
  hasMap: boolean,
  setup: ReturnType<typeof getSaleSetup>,
) {
  if (selected === 'admission') return !hasMap;
  if (!selected || !hasMap || setup.model !== selected) return false;
  return selected === 'zones' || setup.seatCount > 0;
}

export function performanceStatusKey(
  performance: Pick<ManagedPerformance, 'status' | 'salesSuspended' | 'saleStartAt' | 'saleEndAt'>,
  now = Date.now(),
) {
  switch (performance.status) {
    case 'DRAFT':
      return 'performances:draftStatus';
    case 'CANCELLED':
      return 'performances:setupStatusCancelled';
    case 'COMPLETED':
      return 'performances:setupStatusCompleted';
  }
  if (performance.salesSuspended) return 'performances:setupStatusPaused';
  if (performance.status === 'SOLD_OUT') return 'performances:setupStatusSoldOut';
  if (now < Date.parse(performance.saleStartAt)) return 'performances:setupStatusScheduled';
  if (now >= Date.parse(performance.saleEndAt)) return 'performances:setupStatusClosed';
  return 'performances:setupStatusSelling';
}
