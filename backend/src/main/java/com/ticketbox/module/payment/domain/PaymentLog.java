package com.ticketbox.module.payment.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "payment_logs")
@Getter
@NoArgsConstructor
public class PaymentLog extends BaseEntity {

    public enum Provider {
        VNPAY, MOMO, MOCK
    }

    public enum EventType {
        INITIATED, WEBHOOK_RECEIVED, SUCCESS, FAILED, TIMEOUT, REFUNDED
    }

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private Provider provider;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 50)
    private EventType eventType;

    @Column(name = "provider_ref", length = 255)
    private String providerRef;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_payload", columnDefinition = "jsonb")
    private String rawPayload;

    @Column(name = "amount", precision = 12, scale = 0)
    private BigDecimal amount;

    public void setOrderId(UUID orderId) {
        this.orderId = orderId;
    }

    public void setProvider(Provider provider) {
        this.provider = provider;
    }

    public void setEventType(EventType eventType) {
        this.eventType = eventType;
    }

    public void setProviderRef(String providerRef) {
        this.providerRef = providerRef;
    }

    public void setRawPayload(String rawPayload) {
        this.rawPayload = rawPayload;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }
}
