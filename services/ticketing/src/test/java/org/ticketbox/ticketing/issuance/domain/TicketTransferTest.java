package org.ticketbox.ticketing.issuance.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.ticketbox.ticketing.domain.DomainViolation;

import java.time.OffsetDateTime;
import java.util.UUID;

class TicketTransferTest {
    private final OffsetDateTime now = OffsetDateTime.parse("2026-12-01T10:00:00Z");
    private final UUID sender = UUID.randomUUID();
    private final UUID recipient = UUID.randomUUID();

    private TicketTransfer offer() {
        return TicketTransfer.offer(UUID.randomUUID(), sender, recipient, "Sender", "Recipient", now, now.plusDays(1));
    }

    @Test
    void recipientAcceptsOnce() {
        var transfer = offer();
        UUID replacement = UUID.randomUUID();
        transfer.accept(recipient, now.plusHours(1), replacement);
        assertThat(transfer.status()).isEqualTo(TicketTransfer.Status.ACCEPTED);
        assertThat(transfer.newTicketId()).isEqualTo(replacement);
        assertThatThrownBy(() -> transfer.accept(recipient, now.plusHours(2), UUID.randomUUID()))
                .isInstanceOf(DomainViolation.class);
        assertThatThrownBy(() -> transfer.cancel(sender, now.plusHours(2))).isInstanceOf(DomainViolation.class);
    }

    @Test
    void onlyTheRightPersonCanDecide() {
        var transfer = offer();
        assertThatThrownBy(() -> transfer.accept(sender, now, UUID.randomUUID())).isInstanceOf(DomainViolation.class);
        assertThatThrownBy(() -> transfer.decline(sender, now)).isInstanceOf(DomainViolation.class);
        assertThatThrownBy(() -> transfer.cancel(recipient, now)).isInstanceOf(DomainViolation.class);
        assertThat(transfer.status()).isEqualTo(TicketTransfer.Status.PENDING);
    }

    @Test
    void cannotBeAcceptedAtOrAfterTheCutoffButExpiresThen() {
        var transfer = offer();
        assertThatThrownBy(() -> transfer.accept(recipient, now.plusDays(1), UUID.randomUUID()))
                .isInstanceOf(DomainViolation.class);
        assertThatThrownBy(() -> transfer.expire(now.plusHours(1))).isInstanceOf(DomainViolation.class);
        transfer.expire(now.plusDays(1));
        assertThat(transfer.status()).isEqualTo(TicketTransfer.Status.EXPIRED);
    }

    @Test
    void senderCancelsAndRecipientDeclines() {
        var cancelled = offer();
        cancelled.cancel(sender, now);
        assertThat(cancelled.status()).isEqualTo(TicketTransfer.Status.CANCELLED);
        var declined = offer();
        declined.decline(recipient, now);
        assertThat(declined.status()).isEqualTo(TicketTransfer.Status.DECLINED);
    }

    @Test
    void offerToSelfOrAfterCutoffIsRejected() {
        assertThatThrownBy(() -> TicketTransfer.offer(UUID.randomUUID(), sender, sender, "A", "A", now, now.plusDays(1)))
                .isInstanceOf(DomainViolation.class);
        assertThatThrownBy(() -> TicketTransfer.offer(UUID.randomUUID(), sender, recipient, "A", "B", now, now))
                .isInstanceOf(DomainViolation.class);
    }

    @Test
    void eligibilityReportsTheFirstBlocker() {
        var doors = now.plusHours(5);
        var cutoff = TransferEligibility.cutoff(doors);
        assertThat(cutoff).isEqualTo(now.plusHours(3));
        assertThat(blocker(Ticket.Status.VALID, false, cutoff, false, false)).isNull();
        assertThat(blocker(Ticket.Status.USED, false, cutoff, false, false)).isEqualTo(TransferEligibility.Reason.NOT_VALID);
        assertThat(blocker(Ticket.Status.VALID, true, cutoff, false, false)).isEqualTo(TransferEligibility.Reason.RECEIVED);
        assertThat(blocker(Ticket.Status.VALID, false, now, false, false)).isEqualTo(TransferEligibility.Reason.CUTOFF);
        assertThat(blocker(Ticket.Status.VALID, false, cutoff, true, false)).isEqualTo(TransferEligibility.Reason.REFUND_HOLD);
        assertThat(blocker(Ticket.Status.VALID, false, cutoff, false, true)).isEqualTo(TransferEligibility.Reason.DISRUPTED);
    }

    private TransferEligibility.Reason blocker(Ticket.Status status, boolean received, OffsetDateTime cutoff,
            boolean hold, boolean disrupted) {
        return TransferEligibility.blocker(new TransferEligibility.Facts(status, received, cutoff, hold, disrupted), now)
                .orElse(null);
    }
}
