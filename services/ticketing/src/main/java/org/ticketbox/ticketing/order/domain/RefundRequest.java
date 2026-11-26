package org.ticketbox.ticketing.order.domain;

import org.ticketbox.ticketing.domain.DomainViolation;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A buyer's request to refund a whole order. It owns its transitions: the organizer decides a buyer
 * request, a postponement request is approved by the event change itself, and the refund result closes it.
 */
public final class RefundRequest {
    public enum Status {
        REQUESTED,
        APPROVED,
        REJECTED,
        WITHDRAWN,
        REFUNDED,
        FAILED
    }

    public enum Origin {
        BUYER,
        POSTPONEMENT
    }

    public static final int MAX_TEXT = 1000;

    private final UUID id;
    private final UUID orderId;
    private final UUID buyerId;
    private final String reason;
    private final Origin origin;
    private final OffsetDateTime createdAt;
    private Status status;
    private UUID decidedBy;
    private String decisionNote;
    private OffsetDateTime decidedAt;
    private UUID paymentCaseId;

    public RefundRequest(UUID id, UUID orderId, UUID buyerId, String reason, Origin origin, Status status,
            UUID decidedBy, String decisionNote, OffsetDateTime createdAt, OffsetDateTime decidedAt,
            UUID paymentCaseId) {
        this.id = id;
        this.orderId = orderId;
        this.buyerId = buyerId;
        this.reason = reason;
        this.origin = origin;
        this.status = status;
        this.decidedBy = decidedBy;
        this.decisionNote = decisionNote;
        this.createdAt = createdAt;
        this.decidedAt = decidedAt;
        this.paymentCaseId = paymentCaseId;
    }

    /** A buyer request waits for the organizer; a postponement request goes straight to a platform case. */
    public static RefundRequest open(UUID orderId, UUID buyerId, String reason, Origin origin, OffsetDateTime now) {
        String text = reason == null ? "" : reason.strip();
        if (text.isEmpty()) throw violation("INVALID_REQUEST", "error.refund-request.reason-required");
        if (text.length() > MAX_TEXT) throw violation("INVALID_REQUEST", "error.refund-request.reason-too-long");
        boolean direct = origin == Origin.POSTPONEMENT;
        return new RefundRequest(UUID.randomUUID(), orderId, buyerId, text, origin,
                direct ? Status.APPROVED : Status.REQUESTED, null, null, now, direct ? now : null, null);
    }

    public void approve(UUID actor, OffsetDateTime now) {
        requireStatus(Status.REQUESTED);
        status = Status.APPROVED;
        decidedBy = actor;
        decidedAt = now;
    }

    public void reject(UUID actor, String note, OffsetDateTime now) {
        requireStatus(Status.REQUESTED);
        String text = note == null ? "" : note.strip();
        if (text.isEmpty()) throw violation("INVALID_REQUEST", "error.refund-request.note-required");
        if (text.length() > MAX_TEXT) throw violation("INVALID_REQUEST", "error.refund-request.note-too-long");
        status = Status.REJECTED;
        decidedBy = actor;
        decisionNote = text;
        decidedAt = now;
    }

    /** Only the buyer, and only while the organizer has not decided. */
    public void withdraw(UUID actor, OffsetDateTime now) {
        if (!buyerId.equals(actor)) throw violation("REFUND_REQUEST_NOT_FOUND", "error.refund-request.not-found");
        requireStatus(Status.REQUESTED);
        status = Status.WITHDRAWN;
        decidedAt = now;
    }

    public void attachCase(UUID caseId) {
        requireStatus(Status.APPROVED);
        if (paymentCaseId != null && !paymentCaseId.equals(caseId)) {
            throw violation("REFUND_REQUEST_NOT_OPEN", "error.refund-request.not-open");
        }
        paymentCaseId = caseId;
    }

    /** The confirmed refund closes the request, also when an operator refunded the order directly. */
    public void refunded(OffsetDateTime now) {
        if (!isOpen()) throw violation("REFUND_REQUEST_NOT_OPEN", "error.refund-request.not-open");
        if (status == Status.REQUESTED) decidedAt = now;
        status = Status.REFUNDED;
    }

    /** The platform case was closed without a refund. */
    public void failed() {
        requireStatus(Status.APPROVED);
        status = Status.FAILED;
    }

    public boolean isOpen() {
        return status == Status.REQUESTED || status == Status.APPROVED;
    }

    private void requireStatus(Status expected) {
        if (status != expected) throw violation("REFUND_REQUEST_NOT_OPEN", "error.refund-request.not-open");
    }

    private static DomainViolation violation(String rule, String message) {
        return new DomainViolation(rule, message);
    }

    public UUID id() { return id; }
    public UUID orderId() { return orderId; }
    public UUID buyerId() { return buyerId; }
    public String reason() { return reason; }
    public Origin origin() { return origin; }
    public Status status() { return status; }
    public UUID decidedBy() { return decidedBy; }
    public String decisionNote() { return decisionNote; }
    public OffsetDateTime createdAt() { return createdAt; }
    public OffsetDateTime decidedAt() { return decidedAt; }
    public UUID paymentCaseId() { return paymentCaseId; }
}
