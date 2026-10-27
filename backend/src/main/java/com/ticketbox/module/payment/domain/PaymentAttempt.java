package com.ticketbox.module.payment.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "payment_attempts")
@Getter @Setter
public class PaymentAttempt extends BaseEntity {
    public enum State { CREATED, PROCESSING, READY, UNKNOWN, FAILED, SUCCEEDED, RECONCILIATION_REQUIRED, REVIEW_REQUIRED }
    @Column(nullable = false, unique = true) private UUID orderId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PaymentLog.Provider provider;
    @Column(nullable = false, unique = true) private String requestId;
    @Column(nullable = false, precision = 12, scale = 0) private BigDecimal amount;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private State state;
    @Column(columnDefinition = "text") private String paymentUrl;
    private String providerTransactionId;
    @Column(columnDefinition = "text") private String rawPayload;
    @Column(nullable = false) private OffsetDateTime expiresAt;
    @Column(nullable = false) private OffsetDateTime nextQueryAt;
    private OffsetDateTime leaseUntil;
    private UUID leaseOwner;
    @Column(nullable = false) private int queryCount;
    @Column(length = 1000) private String lastError;
}
