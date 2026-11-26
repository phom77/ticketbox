package org.ticketbox.ticketing.order.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.ticketbox.ticketing.order.domain.RefundEligibility.Disruption;
import org.ticketbox.ticketing.order.domain.RefundEligibility.Facts;
import org.ticketbox.ticketing.order.domain.RefundEligibility.Reason;

import java.time.OffsetDateTime;

class RefundEligibilityTest {
    private final OffsetDateTime now = OffsetDateTime.parse("2026-12-01T10:00:00Z");

    private Facts facts(OffsetDateTime doors, Disruption disruption) {
        return new Facts(true, 2, 0, 0, false, false, false, doors, doors.plusHours(1), disruption);
    }

    @Test
    void anUnusedPaidOrderBeforeTheWindowGoesToTheOrganizer() {
        var outcome = RefundEligibility.evaluate(facts(now.plusDays(3), Disruption.NONE), now);
        assertThat(outcome.allowed()).isTrue();
        assertThat(outcome.origin()).isEqualTo(RefundRequest.Origin.BUYER);
        assertThat(outcome.deadline()).isEqualTo(now.plusDays(2));
    }

    @Test
    void theWindowClosesTwentyFourHoursBeforeDoors() {
        assertThat(RefundEligibility.blocker(facts(now.plusHours(24), Disruption.NONE), now)).contains(Reason.WINDOW_CLOSED);
        assertThat(RefundEligibility.blocker(facts(now.plusHours(25), Disruption.NONE), now)).isEmpty();
    }

    @Test
    void usedTransferredAndPendingTicketsBlock() {
        var base = facts(now.plusDays(3), Disruption.NONE);
        assertThat(RefundEligibility.blocker(new Facts(true, 1, 1, 0, false, false, false, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.TICKET_USED);
        assertThat(RefundEligibility.blocker(new Facts(true, 1, 0, 1, false, false, false, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.TICKET_TRANSFERRED);
        assertThat(RefundEligibility.blocker(new Facts(true, 2, 0, 0, true, false, false, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.TRANSFER_PENDING);
        assertThat(RefundEligibility.blocker(new Facts(true, 0, 0, 0, false, false, false, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.NO_TICKETS);
    }

    @Test
    void anOpenRequestOrRefundCaseBlocksAnotherRequest() {
        var base = facts(now.plusDays(3), Disruption.NONE);
        assertThat(RefundEligibility.blocker(new Facts(true, 2, 0, 0, false, false, true, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.REQUEST_OPEN);
        assertThat(RefundEligibility.blocker(new Facts(true, 2, 0, 0, false, true, false, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.REFUND_IN_PROGRESS);
        assertThat(RefundEligibility.blocker(new Facts(false, 2, 0, 0, false, false, false, base.doorsAt(), base.eventDate(), Disruption.NONE), now))
                .contains(Reason.NOT_PAID);
    }

    @Test
    void aPostponedEventSkipsTheOrganizerUntilTheNewDate() {
        var soon = facts(now.plusHours(3), Disruption.POSTPONED);
        var outcome = RefundEligibility.evaluate(soon, now);
        assertThat(outcome.origin()).isEqualTo(RefundRequest.Origin.POSTPONEMENT);
        assertThat(RefundEligibility.blocker(facts(now.minusDays(1), Disruption.POSTPONED), now)).contains(Reason.EVENT_PASSED);
    }

    @Test
    void aCancelledEventPointsToTheOptionsPage() {
        assertThat(RefundEligibility.blocker(facts(now.plusDays(30), Disruption.CANCELLED), now)).contains(Reason.CANCELLED);
    }

    @Test
    void theDecisionOnlyRechecksTheOrderAndItsTickets() {
        assertThat(RefundEligibility.stillRefundable(facts(now.plusHours(2), Disruption.NONE))).isEmpty();
        assertThat(RefundEligibility.stillRefundable(new Facts(true, 1, 1, 0, false, false, true, now, now, Disruption.NONE)))
                .contains(Reason.TICKET_USED);
        assertThat(RefundEligibility.stillRefundable(new Facts(true, 2, 0, 0, false, true, true, now, now, Disruption.NONE)))
                .contains(Reason.REFUND_IN_PROGRESS);
    }
}
