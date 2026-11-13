package org.ticketbox.ticketing.order.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface RefundProviders {
    enum Action { REQUEST, BEGIN_APPROVAL, APPROVE, CONFIRM, ABORT }
    enum Admission { HELD, NOT_SYNCED, ALREADY_USED, CONFLICT, RELEASED }
    record Command(UUID actionId, UUID actorId, UUID caseId, Action action, String detail, Long amount,
                   String externalReference, OffsetDateTime occurredAt) {}
    record Case(UUID id, UUID orderId, String state, long amount, UUID requestedBy, UUID approvedBy,
                String provider, String transactionId, String externalReference, OffsetDateTime occurredAt,
                boolean compensation) {}

    Case apply(UUID order, Command command);
    Admission hold(UUID caseId, List<UUID> tickets);
    void release(UUID caseId);
}
