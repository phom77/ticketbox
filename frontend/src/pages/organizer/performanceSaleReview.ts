import type { DraftLayout, ManagedPerformance, SaleDraft } from '../../api/performanceManagement';

export type OfferDateField = 'saleStartAt' | 'saleEndAt';
export const offerDateFields = ['saleStartAt', 'saleEndAt'] as const;
export type OfferDates = Record<string, Partial<Record<OfferDateField, string>> | undefined>;

export function inspectSaleDraft(
  layout: DraftLayout | null,
  sale: SaleDraft,
  performance: Pick<ManagedPerformance, 'saleStartAt' | 'saleEndAt'>,
  now: number,
) {
  const starts = Date.parse(performance.saleStartAt);
  const ends = Date.parse(performance.saleEndAt);
  const sections = new Map(layout?.sections.map((section) => [section.id, section]));
  const groups = new Set(sale.groups.map((group) => group.id));
  const gaGroups = new Set<string>();
  const assignedSeats = new Set<string>();

  let saveIssue = null;
  for (const group of sale.groups) {
    if (group.kind === 'ASSIGNED' && group.capacity === 0) {
      saveIssue = 'emptySeatGroup';
      break;
    }
    if (
      !group.sectionLabel.trim() ||
      !Number.isInteger(group.capacity) ||
      group.capacity < 1 ||
      group.capacity > 2_147_483_647
    ) {
      saveIssue = 'reviewInvalidGroup';
      break;
    }
    const section = group.sectionId ? sections.get(group.sectionId) : undefined;
    const matches = section
      ? group.kind === section.kind && group.sectionLabel === section.label
      : !layout && group.sectionId === null && group.kind === 'GA';
    if (!matches) {
      saveIssue = 'reviewMapMismatch';
      break;
    }

    if (group.kind === 'GA') {
      const key = group.sectionId ?? group.sectionLabel;
      if (gaGroups.has(key)) {
        saveIssue = 'reviewDuplicateGroup';
        break;
      }
      gaGroups.add(key);
    }
    for (const seat of group.seats) assignedSeats.add(seat.id);
  }

  if (!saveIssue) {
    for (const offer of sale.offers) {
      if (
        !groups.has(offer.groupId) ||
        !offer.name.trim() ||
        !Number.isSafeInteger(offer.price) ||
        offer.price < 1 ||
        offer.price > 999_999_999_999
      ) {
        saveIssue = 'reviewInvalidOffer';
        break;
      }
      const offerStart = Date.parse(offer.saleStartAt);
      const offerEnd = Date.parse(offer.saleEndAt);
      if (!(offerStart >= starts && offerEnd <= ends && offerStart < offerEnd)) {
        saveIssue = 'offerWindowOutsidePerformance';
        break;
      }
    }
  }

  const publishIssues: string[] = [];
  if (!sale.offers.some((offer) => offer.active)) publishIssues.push('reviewMissingOffer');
  const unassigned = layout?.sections.some(
    (section) =>
      section.kind === 'ASSIGNED' &&
      section.rows.some((row) =>
        row.seats.some((seat) => !seat.blocked && !assignedSeats.has(seat.id)),
      ),
  );
  if (!saveIssue && unassigned) publishIssues.push('reviewUnassignedSeats');
  if (ends <= now) publishIssues.push('reviewSaleEnded');

  return { saveIssue, publishIssues };
}
