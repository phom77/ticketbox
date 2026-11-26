package org.ticketbox.ticketing.order.domain;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;

/** The rules that decide whether a buyer can ask for a refund of an order. */
public final class RefundEligibility {
    /** Buyer requests stop this long before doors open. */
    public static final Duration WINDOW_BEFORE_DOORS = Duration.ofHours(24);

    private RefundEligibility() {}

    public enum Disruption {
        NONE,
        POSTPONED,
        CANCELLED
    }

    public enum Reason {
        NOT_PAID("error.refund-request.not-paid"),
        NO_TICKETS("error.refund-request.no-tickets"),
        REQUEST_OPEN("error.refund-request.already-open"),
        TICKET_USED("error.refund-request.ticket-used"),
        TICKET_TRANSFERRED("error.refund-request.ticket-transferred"),
        TRANSFER_PENDING("error.refund-request.transfer-pending"),
        REFUND_IN_PROGRESS("error.refund-request.refund-in-progress"),
        CANCELLED("error.refund-request.cancelled"),
        EVENT_PASSED("error.refund-request.event-passed"),
        WINDOW_CLOSED("error.refund-request.window-closed");

        private final String messageKey;

        Reason(String messageKey) {
            this.messageKey = messageKey;
        }

        public String messageKey() {
            return messageKey;
        }
    }

    /**
     * What the order and its event look like right now. {@code eventDate} is the current date: after a
     * postponement it is the new date.
     */
    public record Facts(boolean paid, int validTickets, int usedTickets, int transferredTickets, boolean pendingTransfer,
            boolean refundCase, boolean openRequest, OffsetDateTime doorsAt, OffsetDateTime eventDate,
            Disruption disruption) {}

    /** Either the origin the new request would have, or the reason it is not allowed. */
    public record Outcome(RefundRequest.Origin origin, Reason blocker, OffsetDateTime deadline) {
        public boolean allowed() {
            return blocker == null;
        }
    }

    public static Outcome evaluate(Facts facts, OffsetDateTime now) {
        if (!facts.paid()) return blocked(Reason.NOT_PAID);
        if (facts.openRequest()) return blocked(Reason.REQUEST_OPEN);
        if (facts.usedTickets() > 0) return blocked(Reason.TICKET_USED);
        if (facts.transferredTickets() > 0) return blocked(Reason.TICKET_TRANSFERRED);
        if (facts.validTickets() < 1) return blocked(Reason.NO_TICKETS);
        if (facts.pendingTransfer()) return blocked(Reason.TRANSFER_PENDING);
        if (facts.refundCase()) return blocked(Reason.REFUND_IN_PROGRESS);
        return switch (facts.disruption()) {
            case CANCELLED -> blocked(Reason.CANCELLED);
            case POSTPONED -> now.isBefore(facts.eventDate())
                    ? new Outcome(RefundRequest.Origin.POSTPONEMENT, null, facts.eventDate())
                    : blocked(Reason.EVENT_PASSED);
            case NONE -> {
                OffsetDateTime deadline = facts.doorsAt().minus(WINDOW_BEFORE_DOORS);
                yield now.isBefore(deadline) ? new Outcome(RefundRequest.Origin.BUYER, null, deadline)
                        : new Outcome(null, Reason.WINDOW_CLOSED, deadline);
            }
        };
    }

    /**
     * The checks that must still hold when the organizer decides: the buyer may have lost the right in the meantime
     * (an admitted ticket), but the original request window and the disruption state no longer apply.
     */
    public static Optional<Reason> stillRefundable(Facts facts) {
        if (!facts.paid()) return Optional.of(Reason.NOT_PAID);
        if (facts.usedTickets() > 0) return Optional.of(Reason.TICKET_USED);
        if (facts.transferredTickets() > 0) return Optional.of(Reason.TICKET_TRANSFERRED);
        if (facts.validTickets() < 1) return Optional.of(Reason.NO_TICKETS);
        if (facts.refundCase()) return Optional.of(Reason.REFUND_IN_PROGRESS);
        return Optional.empty();
    }

    private static Outcome blocked(Reason reason) {
        return new Outcome(null, reason, null);
    }

    public static Optional<Reason> blocker(Facts facts, OffsetDateTime now) {
        return Optional.ofNullable(evaluate(facts, now).blocker());
    }
}
