package org.ticketbox.ticketing.issuance.domain;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/** The rules that decide whether a ticket can be offered or handed over. */
public final class TransferEligibility {
    /** Offers stop this long before doors open. */
    public static final Duration CUTOFF_BEFORE_DOORS = Duration.ofHours(2);

    private TransferEligibility() {}

    public enum Reason {
        NOT_VALID("error.transfer.not-valid"),
        RECEIVED("error.transfer.received"),
        CUTOFF("error.transfer.cutoff"),
        REFUND_HOLD("error.transfer.refund-hold"),
        DISRUPTED("error.transfer.disrupted");

        private final String messageKey;

        Reason(String messageKey) {
            this.messageKey = messageKey;
        }

        public String messageKey() {
            return messageKey;
        }
    }

    public record Facts(Ticket.Status status, boolean receivedByTransfer, OffsetDateTime cutoffAt,
            boolean refundHold, boolean disrupted) {}

    public static OffsetDateTime cutoff(OffsetDateTime doorsOrStart) {
        return doorsOrStart.minus(CUTOFF_BEFORE_DOORS);
    }

    public static Optional<Reason> blocker(Facts facts, OffsetDateTime now) {
        if (facts.status() != Ticket.Status.VALID) return Optional.of(Reason.NOT_VALID);
        if (facts.receivedByTransfer()) return Optional.of(Reason.RECEIVED);
        if (facts.disrupted()) return Optional.of(Reason.DISRUPTED);
        if (facts.refundHold()) return Optional.of(Reason.REFUND_HOLD);
        if (!now.isBefore(facts.cutoffAt())) return Optional.of(Reason.CUTOFF);
        return Optional.empty();
    }
}
