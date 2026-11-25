package com.ticketbox.payments.application.port;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface RefundCases {
    enum Action { REQUEST, BEGIN_APPROVAL, APPROVE, CONFIRM, ABORT }

    /**
     * {@code origin} (BUYER or POSTPONEMENT) and {@code refundRequestId} are set together when Ticketing opens a case from
     * a buyer refund request; they are absent for operator cases.
     */
    record Command(UUID actionId, UUID actorId, UUID caseId, Action action, String detail,
                   Long amount, String externalReference, OffsetDateTime occurredAt,
                   @JsonInclude(JsonInclude.Include.NON_NULL) String origin,
                   @JsonInclude(JsonInclude.Include.NON_NULL) UUID refundRequestId) {
        public Command(UUID actionId, UUID actorId, UUID caseId, Action action, String detail,
                       Long amount, String externalReference, OffsetDateTime occurredAt) {
            this(actionId, actorId, caseId, action, detail, amount, externalReference, occurredAt, null, null);
        }
    }

    record Case(UUID id, UUID orderId, String state, long amount, UUID requestedBy, UUID approvedBy,
                String provider, String transactionId, String externalReference, OffsetDateTime occurredAt,
                boolean compensation, @JsonInclude(JsonInclude.Include.NON_NULL) String origin,
                @JsonInclude(JsonInclude.Include.NON_NULL) UUID refundRequestId) {}

    Case apply(UUID order, Command command);
}
