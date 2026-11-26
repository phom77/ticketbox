package org.ticketbox.ticketing.order.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface RefundProviders {
    enum Action { REQUEST, BEGIN_APPROVAL, APPROVE, CONFIRM, ABORT }
    enum Admission { HELD, NOT_SYNCED, ALREADY_USED, CONFLICT, RELEASED }
    /** {@code origin} and {@code refundRequestId} are set only for cases opened from a buyer refund request. */
    record Command(UUID actionId, UUID actorId, UUID caseId, Action action, String detail, Long amount,
                   String externalReference, OffsetDateTime occurredAt, String origin, UUID refundRequestId) {
        public Command(UUID actionId, UUID actorId, UUID caseId, Action action, String detail, Long amount,
                       String externalReference, OffsetDateTime occurredAt) {
            this(actionId, actorId, caseId, action, detail, amount, externalReference, occurredAt, null, null);
        }
    }
    record Case(UUID id, UUID orderId, String state, long amount, UUID requestedBy, UUID approvedBy,
                String provider, String transactionId, String externalReference, OffsetDateTime occurredAt,
                boolean compensation) {}

    Case apply(UUID order, Command command);
    Admission hold(UUID caseId, List<UUID> tickets);
    void release(UUID caseId);
}
