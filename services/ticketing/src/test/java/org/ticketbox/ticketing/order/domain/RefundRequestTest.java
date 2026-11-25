package org.ticketbox.ticketing.order.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.ticketbox.ticketing.domain.DomainViolation;

import java.time.OffsetDateTime;
import java.util.UUID;

class RefundRequestTest {
    private final OffsetDateTime now = OffsetDateTime.parse("2026-12-01T10:00:00Z");
    private final UUID buyer = UUID.randomUUID();
    private final UUID organizer = UUID.randomUUID();

    private RefundRequest buyerRequest() {
        return RefundRequest.open(UUID.randomUUID(), buyer, "  Cannot attend  ", RefundRequest.Origin.BUYER, now);
    }

    @Test
    void buyerRequestWaitsForTheOrganizerAndTrimsTheReason() {
        var request = buyerRequest();
        assertThat(request.status()).isEqualTo(RefundRequest.Status.REQUESTED);
        assertThat(request.reason()).isEqualTo("Cannot attend");
        assertThat(request.decidedAt()).isNull();
        assertThat(request.isOpen()).isTrue();
    }

    @Test
    void postponementRequestIsApprovedByTheEventChange() {
        var request = RefundRequest.open(UUID.randomUUID(), buyer, "New date does not suit", RefundRequest.Origin.POSTPONEMENT, now);
        assertThat(request.status()).isEqualTo(RefundRequest.Status.APPROVED);
        assertThat(request.decidedBy()).isNull();
        assertThat(request.decidedAt()).isEqualTo(now);
        assertThatThrownBy(() -> request.approve(organizer, now)).isInstanceOf(DomainViolation.class);
    }

    @Test
    void reasonIsRequiredAndBounded() {
        assertThatThrownBy(() -> RefundRequest.open(UUID.randomUUID(), buyer, "  ", RefundRequest.Origin.BUYER, now))
                .hasMessage("error.refund-request.reason-required");
        assertThatThrownBy(() -> RefundRequest.open(UUID.randomUUID(), buyer, "x".repeat(1001), RefundRequest.Origin.BUYER, now))
                .hasMessage("error.refund-request.reason-too-long");
    }

    @Test
    void organizerApprovesOnceAndRejectionNeedsANote() {
        var approved = buyerRequest();
        approved.approve(organizer, now);
        assertThat(approved.status()).isEqualTo(RefundRequest.Status.APPROVED);
        assertThat(approved.decidedBy()).isEqualTo(organizer);
        assertThatThrownBy(() -> approved.approve(organizer, now)).hasMessage("error.refund-request.not-open");
        assertThatThrownBy(() -> approved.reject(organizer, "late", now)).hasMessage("error.refund-request.not-open");

        var rejected = buyerRequest();
        assertThatThrownBy(() -> rejected.reject(organizer, " ", now)).hasMessage("error.refund-request.note-required");
        rejected.reject(organizer, " Outside policy ", now);
        assertThat(rejected.status()).isEqualTo(RefundRequest.Status.REJECTED);
        assertThat(rejected.decisionNote()).isEqualTo("Outside policy");
        assertThat(rejected.isOpen()).isFalse();
    }

    @Test
    void onlyTheBuyerCanWithdrawAndOnlyBeforeADecision() {
        var request = buyerRequest();
        assertThatThrownBy(() -> request.withdraw(organizer, now)).hasMessage("error.refund-request.not-found");
        request.withdraw(buyer, now);
        assertThat(request.status()).isEqualTo(RefundRequest.Status.WITHDRAWN);
        assertThat(request.isOpen()).isFalse();

        var decided = buyerRequest();
        decided.approve(organizer, now);
        assertThatThrownBy(() -> decided.withdraw(buyer, now)).hasMessage("error.refund-request.not-open");
    }

    @Test
    void theRefundResultClosesAnOpenRequestExactlyOnce() {
        var request = buyerRequest();
        request.approve(organizer, now);
        UUID caseId = UUID.randomUUID();
        request.attachCase(caseId);
        assertThatThrownBy(() -> request.attachCase(UUID.randomUUID())).hasMessage("error.refund-request.not-open");
        request.refunded(now.plusDays(1));
        assertThat(request.status()).isEqualTo(RefundRequest.Status.REFUNDED);
        assertThat(request.paymentCaseId()).isEqualTo(caseId);
        assertThatThrownBy(() -> request.refunded(now)).hasMessage("error.refund-request.not-open");
        assertThatThrownBy(request::failed).hasMessage("error.refund-request.not-open");
    }

    @Test
    void anAbortedCaseFailsAnApprovedRequestOnly() {
        var request = buyerRequest();
        assertThatThrownBy(request::failed).isInstanceOf(DomainViolation.class);
        request.approve(organizer, now);
        request.failed();
        assertThat(request.status()).isEqualTo(RefundRequest.Status.FAILED);
        assertThat(request.isOpen()).isFalse();
    }
}
