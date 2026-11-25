import type { TicketTransfer, TransferBlocker } from '../../api/tickets';

/** Explains why a ticket cannot be offered. Tickets that are not valid or were received show no action. */
export const transferBlockerKeys = {
  CUTOFF: 'customer:transfer_blockedCutoff',
  REFUND_HOLD: 'customer:transfer_blockedRefund',
  DISRUPTED: 'customer:transfer_blockedDisrupted',
} satisfies Partial<Record<TransferBlocker, string>>;

export function transferBlockerKey(reason?: TransferBlocker | null) {
  return reason && reason in transferBlockerKeys
    ? transferBlockerKeys[reason as keyof typeof transferBlockerKeys]
    : null;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isTransferEmail(value: string) {
  const email = normalizeEmail(value);
  return email.length <= 254 && emailPattern.test(email);
}

/** Offers waiting for the signed-in person, soonest expiry first. */
export function pendingReceivedOffers(transfers: readonly TicketTransfer[], now: number) {
  return transfers
    .filter(
      (transfer) =>
        transfer.role === 'RECEIVED' &&
        transfer.status === 'PENDING' &&
        Date.parse(transfer.expiresAt) > now,
    )
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}

/** Tickets of one order that the buyer gave away. */
export function acceptedTransfersForOrder(transfers: readonly TicketTransfer[], orderId: string) {
  return transfers.filter(
    (transfer) =>
      transfer.role === 'SENT' && transfer.status === 'ACCEPTED' && transfer.orderId === orderId,
  );
}
