import type {
  RefundBlocker,
  RefundRequest,
  RefundRequestOrigin,
  RefundRequestStatus,
  RefundStage,
} from '../../api/refundRequests';

export const REASON_MAX_LENGTH = 1000;

/** The steps a request goes through, in order. A declined, withdrawn or failed request ends early. */
export type RefundStep = {
  key: 'requested' | 'decided' | 'refunded';
  state: 'done' | 'current' | 'upcoming';
};

const statusKeys: Record<RefundRequestStatus, string> = {
  REQUESTED: 'customer:refund_status_REQUESTED',
  APPROVED: 'customer:refund_status_APPROVED',
  REJECTED: 'customer:refund_status_REJECTED',
  WITHDRAWN: 'customer:refund_status_WITHDRAWN',
  REFUNDED: 'customer:refund_status_REFUNDED',
  FAILED: 'customer:refund_status_FAILED',
};

const blockerKeys: Record<RefundBlocker, string> = {
  NOT_PAID: 'customer:refund_blocked_NOT_PAID',
  NO_TICKETS: 'customer:refund_blocked_NO_TICKETS',
  REQUEST_OPEN: 'customer:refund_blocked_REQUEST_OPEN',
  TICKET_USED: 'customer:refund_blocked_TICKET_USED',
  TICKET_TRANSFERRED: 'customer:refund_blocked_TICKET_TRANSFERRED',
  TRANSFER_PENDING: 'customer:refund_blocked_TRANSFER_PENDING',
  REFUND_IN_PROGRESS: 'customer:refund_blocked_REFUND_IN_PROGRESS',
  CANCELLED: 'customer:refund_blocked_CANCELLED',
  EVENT_PASSED: 'customer:refund_blocked_EVENT_PASSED',
  WINDOW_CLOSED: 'customer:refund_blocked_WINDOW_CLOSED',
};

export function refundStatusKey(status: RefundRequestStatus, origin: RefundRequestOrigin) {
  // A postponement request has no organizer step, so "waiting" means the platform team.
  if (status === 'APPROVED' && origin === 'POSTPONEMENT') return 'customer:refund_status_PLATFORM';
  return statusKeys[status];
}

export function refundBlockerKey(blocker?: RefundBlocker | null) {
  return blocker ? (blockerKeys[blocker] ?? null) : null;
}

/** Blockers that have an explanation of their own, so no generic "cannot request" text is needed. */
export function blockerNeedsOptionsLink(blocker?: RefundBlocker | null) {
  return blocker === 'CANCELLED';
}

export function isOpenRequest(request?: RefundRequest | null) {
  return request?.status === 'REQUESTED' || request?.status === 'APPROVED';
}

export function refundSteps(request: RefundRequest): RefundStep[] {
  const requested: RefundStep = { key: 'requested', state: 'done' };
  switch (request.status) {
    case 'REQUESTED':
      return [
        requested,
        { key: 'decided', state: 'current' },
        { key: 'refunded', state: 'upcoming' },
      ];
    case 'APPROVED':
      return [requested, { key: 'decided', state: 'done' }, { key: 'refunded', state: 'current' }];
    case 'REFUNDED':
      return [requested, { key: 'decided', state: 'done' }, { key: 'refunded', state: 'done' }];
    default:
      return [requested, { key: 'decided', state: 'done' }];
  }
}

/** The label of the second step: who is deciding, or how the request ended. */
export function decidedStepKey(request: RefundRequest) {
  if (request.status === 'REJECTED') return 'customer:refund_step_declined';
  if (request.status === 'WITHDRAWN') return 'customer:refund_step_withdrawn';
  if (request.origin === 'POSTPONEMENT') return 'customer:refund_step_platformReview';
  return request.status === 'REQUESTED'
    ? 'customer:refund_step_organizerReview'
    : 'customer:refund_step_approved';
}

export function refundStageKey(stage: RefundStage) {
  return `customer:refundOptions_stage_${stage}`;
}

export function validRefundReason(reason: string) {
  const text = reason.trim();
  return text.length > 0 && text.length <= REASON_MAX_LENGTH;
}

const keptPrefix = 'ticketbox.keptTicket';

function keptKey(userId: string, concertId: string, newDate: string | null | undefined) {
  return [keptPrefix, userId, concertId, newDate ?? ''].join('|');
}

/** "Keep my ticket" is remembered on this device for the new date; a second postponement asks again. */
export function keepTicket(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  concertId: string,
  newDate: string | null | undefined,
) {
  try {
    storage.setItem(keptKey(userId, concertId, newDate), '1');
  } catch {
    /* Storage can be unavailable; the banner then simply stays. */
  }
}

export function hasKeptTicket(
  storage: Pick<Storage, 'getItem'>,
  userId: string,
  concertId: string,
  newDate: string | null | undefined,
) {
  try {
    return storage.getItem(keptKey(userId, concertId, newDate)) === '1';
  } catch {
    return false;
  }
}
