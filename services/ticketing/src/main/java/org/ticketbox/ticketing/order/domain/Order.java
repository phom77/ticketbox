package org.ticketbox.ticketing.order.domain;

import lombok.Getter;
import lombok.NoArgsConstructor;

import org.ticketbox.ticketing.domain.BaseEntity;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@NoArgsConstructor
public class Order extends BaseEntity {
    private java.util.List<OrderItem> items = new java.util.ArrayList<>();

    public enum Status {
        AWAITING_PAYMENT,
        PAID,
        EXPIRED,
        CANCELLED,
        REFUNDED,
        PAYMENT_FAILED
    }

    public enum PaymentProvider {
        VNPAY,
        MOMO,
        MOCK
    }

    private UUID userId;

    private UUID concertId;

    private Status status = Status.AWAITING_PAYMENT;

    private BigDecimal totalAmount;

    private String idempotencyKey;

    private PaymentProvider paymentProvider;

    private String paymentRef;

    private String paymentUrl;

    private OffsetDateTime paidAt;

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

    public void cancel() {
        requireAwaitingPayment();
        status = Status.CANCELLED;
    }

    public void expire(OffsetDateTime now) {
        requireAwaitingPayment();
        if (expiresAt.isAfter(now))
            throw new org.ticketbox.ticketing.domain.DomainViolation(
                    "INVALID_STATUS_TRANSITION", "Đơn hàng chưa hết hạn");
        status = Status.EXPIRED;
    }

    public boolean pay(PaymentProvider provider, String reference, OffsetDateTime now) {
        if (status == Status.PAID) return false;
        requireAwaitingPayment();
        if (!expiresAt.isAfter(now))
            throw new org.ticketbox.ticketing.domain.DomainViolation(
                    "INVALID_STATUS_TRANSITION", "Đơn hàng đã hết hạn");
        java.util.Objects.requireNonNull(provider);
        if (reference == null || reference.isBlank())
            throw new org.ticketbox.ticketing.domain.DomainViolation(
                    "INVALID_REQUEST", "Giao dịch thanh toán phải có mã tham chiếu");
        status = Status.PAID;
        paidAt = now;
        paymentProvider = provider;
        paymentRef = reference;
        return true;
    }

    private void requireAwaitingPayment() {
        if (status != Status.AWAITING_PAYMENT)
            throw new org.ticketbox.ticketing.domain.DomainViolation(
                    "INVALID_STATUS_TRANSITION", "Chỉ có thể thay đổi đơn đang chờ thanh toán");
    }

    public java.util.List<OrderItem> getItems() {
        return java.util.Collections.unmodifiableList(items);
    }

    public void addItems(java.util.List<OrderItem> lines) {
        requireAwaitingPayment();
        if (!items.isEmpty())
            throw new org.ticketbox.ticketing.domain.DomainViolation(
                    "INVALID_REQUEST", "Đơn hàng đã có chi tiết");
        BigDecimal calculated =
                lines.stream().map(OrderItem::getSubtotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalAmount.compareTo(calculated) != 0)
            throw new org.ticketbox.ticketing.domain.DomainViolation(
                    "INVALID_REQUEST", "Tổng đơn hàng phải khớp chi tiết");
        for (OrderItem line : lines) {
            line.setOrderId(getId());
            items.add(line);
        }
    }

    public static Order awaitingPayment(
            UUID userId,
            UUID concertId,
            Money total,
            String idempotencyKey,
            OffsetDateTime expiresAt) {
        Order order = new Order();
        order.userId = java.util.Objects.requireNonNull(userId);
        order.concertId = java.util.Objects.requireNonNull(concertId);
        order.totalAmount = total.amount();
        order.idempotencyKey = java.util.Objects.requireNonNull(idempotencyKey);
        order.expiresAt = java.util.Objects.requireNonNull(expiresAt);
        return order;
    }
}
