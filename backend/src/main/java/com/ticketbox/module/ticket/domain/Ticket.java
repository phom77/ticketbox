package com.ticketbox.module.ticket.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "tickets")
@NoArgsConstructor
@Getter
public class Ticket extends BaseEntity {

    public enum Status {
        VALID, USED, CANCELLED, TRANSFERRED
    }

    @Column(name = "order_item_id", nullable = false)
    private UUID orderItemId;

    @Column(name = "ticket_type_id", nullable = false)
    private UUID ticketTypeId;

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "qr_code", nullable = false, unique = true, length = 500)
    private String qrCode;

    @Column(name = "qr_secret", nullable = false, length = 255)
    private String qrSecret;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.VALID;

    @CreationTimestamp
    @Column(name = "issued_at", nullable = false, updatable = false)
    private OffsetDateTime issuedAt;

    @Column(name = "used_at")
    private OffsetDateTime usedAt;

    public void setOrderItemId(UUID orderItemId) {
        this.orderItemId = orderItemId;
    }

    public void setTicketTypeId(UUID ticketTypeId) {
        this.ticketTypeId = ticketTypeId;
    }

    public void setConcertId(UUID concertId) {
        this.concertId = concertId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public void setQrCode(String qrCode) {
        this.qrCode = qrCode;
    }

    public void setQrSecret(String qrSecret) {
        this.qrSecret = qrSecret;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public void setIssuedAt(OffsetDateTime issuedAt) {
        this.issuedAt = issuedAt;
    }

    public void setUsedAt(OffsetDateTime usedAt) {
        this.usedAt = usedAt;
    }
}
