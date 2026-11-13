package com.ticketbox.payments.application.port;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface RefundCases {
    enum Action { REQUEST, BEGIN_APPROVAL, APPROVE, CONFIRM, ABORT }

    record Command(UUID actionId, UUID actorId, UUID caseId, Action action, String detail,
                   Long amount, String externalReference, OffsetDateTime occurredAt) {}

    record Case(UUID id, UUID orderId, String state, long amount, UUID requestedBy, UUID approvedBy,
                String provider, String transactionId, String externalReference, OffsetDateTime occurredAt,
                boolean compensation) {}

    Case apply(UUID order, Command command);
}
