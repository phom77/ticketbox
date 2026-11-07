package org.ticketbox.ticketing.issuance.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.ticketing.domain.BaseEntity;

import java.time.OffsetDateTime;
import java.util.UUID;

@NoArgsConstructor
@Getter
public class Ticket extends BaseEntity {

    public enum Status {
        VALID,
        USED,
        CANCELLED,
        TRANSFERRED
    }

    private UUID orderItemId;

    private UUID ticketTypeId;

    private UUID concertId;

    private UUID userId;

    private String qrCode;

    private String qrSecret;

    private Status status = Status.VALID;

    private OffsetDateTime issuedAt;

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

    protected void initializeIssueTime() {
        if (issuedAt == null) issuedAt = OffsetDateTime.now();
    }
}
