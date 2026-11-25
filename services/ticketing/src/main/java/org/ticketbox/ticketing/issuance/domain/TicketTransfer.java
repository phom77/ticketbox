package org.ticketbox.ticketing.issuance.domain;

import org.ticketbox.ticketing.domain.DomainViolation;

import java.time.OffsetDateTime;
import java.util.UUID;

/** One offer of a ticket from its holder to another account. It owns the offer's state transitions. */
public final class TicketTransfer {
    public enum Status {
        PENDING,
        ACCEPTED,
        DECLINED,
        CANCELLED,
        EXPIRED
    }

    private final UUID id;
    private final UUID ticketId;
    private final UUID senderId;
    private final UUID recipientId;
    private final String senderName;
    private final String recipientName;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime expiresAt;
    private Status status;
    private OffsetDateTime decidedAt;
    private UUID newTicketId;

    public TicketTransfer(UUID id, UUID ticketId, UUID senderId, UUID recipientId, String senderName,
            String recipientName, Status status, OffsetDateTime createdAt, OffsetDateTime decidedAt,
            OffsetDateTime expiresAt, UUID newTicketId) {
        this.id = id;
        this.ticketId = ticketId;
        this.senderId = senderId;
        this.recipientId = recipientId;
        this.senderName = senderName;
        this.recipientName = recipientName;
        this.status = status;
        this.createdAt = createdAt;
        this.decidedAt = decidedAt;
        this.expiresAt = expiresAt;
        this.newTicketId = newTicketId;
    }

    public static TicketTransfer offer(UUID ticketId, UUID senderId, UUID recipientId, String senderName,
            String recipientName, OffsetDateTime now, OffsetDateTime expiresAt) {
        if (senderId.equals(recipientId)) throw violation("TRANSFER_NOT_ALLOWED", "error.transfer.self");
        if (!now.isBefore(expiresAt)) throw violation("TRANSFER_NOT_ALLOWED", "error.transfer.cutoff");
        return new TicketTransfer(UUID.randomUUID(), ticketId, senderId, recipientId, senderName, recipientName,
                Status.PENDING, now, null, expiresAt, null);
    }

    /** The recipient takes the ticket; the caller issues the replacement ticket in the same transaction. */
    public void accept(UUID actor, OffsetDateTime now, UUID replacementTicketId) {
        requireParty(actor, recipientId);
        requireOpen(now);
        decide(Status.ACCEPTED, now);
        newTicketId = replacementTicketId;
    }

    public void decline(UUID actor, OffsetDateTime now) {
        requireParty(actor, recipientId);
        requirePending();
        decide(Status.DECLINED, now);
    }

    public void cancel(UUID actor, OffsetDateTime now) {
        requireParty(actor, senderId);
        requirePending();
        decide(Status.CANCELLED, now);
    }

    public void expire(OffsetDateTime now) {
        requirePending();
        if (now.isBefore(expiresAt)) throw violation("TRANSFER_NOT_PENDING", "error.transfer.not-pending");
        decide(Status.EXPIRED, now);
    }

    public boolean involves(UUID account) {
        return senderId.equals(account) || recipientId.equals(account);
    }

    private void requireParty(UUID actor, UUID expected) {
        if (!expected.equals(actor)) throw violation("TRANSFER_NOT_FOUND", "error.transfer.not-found");
    }

    private void requirePending() {
        if (status != Status.PENDING) throw violation("TRANSFER_NOT_PENDING", "error.transfer.not-pending");
    }

    private void requireOpen(OffsetDateTime now) {
        requirePending();
        if (!now.isBefore(expiresAt)) throw violation("TRANSFER_NOT_PENDING", "error.transfer.cutoff");
    }

    private void decide(Status next, OffsetDateTime now) {
        status = next;
        decidedAt = now;
    }

    private static DomainViolation violation(String rule, String message) {
        return new DomainViolation(rule, message);
    }

    public UUID id() { return id; }
    public UUID ticketId() { return ticketId; }
    public UUID senderId() { return senderId; }
    public UUID recipientId() { return recipientId; }
    public String senderName() { return senderName; }
    public String recipientName() { return recipientName; }
    public Status status() { return status; }
    public OffsetDateTime createdAt() { return createdAt; }
    public OffsetDateTime decidedAt() { return decidedAt; }
    public OffsetDateTime expiresAt() { return expiresAt; }
    public UUID newTicketId() { return newTicketId; }
}
