package com.ticketbox.module.ticket.domain;

import com.ticketbox.shared.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
 
@Entity
@Table(name = "orders")
@Getter
@NoArgsConstructor
public class Order extends BaseEntity {

    public enum Status {
        AWAITING_PAYMENT, PAID, EXPIRED, CANCELLED, REFUNDED, PAYMENT_FAILED
    }

    public enum PaymentProvider {
        VNPAY, MOMO, MOCK
    }

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "concert_id", nullable = false)
    private UUID concertId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.AWAITING_PAYMENT;

    @Column(name = "total_amount", nullable = false, precision = 12, scale = 0)
    private BigDecimal totalAmount;

    @Column(name = "idempotency_key", length = 255)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_provider", length = 20)
    private PaymentProvider paymentProvider;

    @Column(name = "payment_ref", length = 255)
    private String paymentRef;

    @Column(name = "payment_url", columnDefinition = "TEXT")
    private String paymentUrl;

    @Column(name = "paid_at")
    private OffsetDateTime paidAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public void setConcertId(UUID concertId) {
        this.concertId = concertId;
    }

    public void setStatus(Status status) {
        this.status = status;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public void setIdempotencyKey(String idempotencyKey) {
        this.idempotencyKey = idempotencyKey;
    }

    public void setPaymentProvider(PaymentProvider paymentProvider) {
        this.paymentProvider = paymentProvider;
    }

    public void setPaymentRef(String paymentRef) {
        this.paymentRef = paymentRef;
    }

    public void setPaymentUrl(String paymentUrl) {
        this.paymentUrl = paymentUrl;
    }

    public void setPaidAt(OffsetDateTime paidAt) {
        this.paidAt = paidAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }
}
