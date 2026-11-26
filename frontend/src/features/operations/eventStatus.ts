/** Label of an event directory status; an unknown value reads as a draft. */
export function eventStatusKey(status: string) {
  switch (status) {
    case 'IN_REVIEW':
      return 'concert-directory:statusInReview';
    case 'CHANGES_REQUESTED':
      return 'concert-directory:statusChangesRequested';
    case 'SCHEDULED':
      return 'concert-directory:statusScheduled';
    case 'ON_SALE':
      return 'concert-directory:statusOnSale';
    case 'SOLD_OUT':
      return 'concert-directory:statusSoldOut';
    case 'PAST':
      return 'concert-directory:statusPast';
    case 'CANCELLED':
      return 'concert-directory:statusCancelled';
    default:
      return 'concert-directory:statusDraft';
  }
}
