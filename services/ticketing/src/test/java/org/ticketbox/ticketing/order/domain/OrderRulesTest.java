package org.ticketbox.ticketing.order.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

class OrderRulesTest {
    @Test
    void terminalOrderCannotBeCancelledAndExpiredMoneyCannotIssueTickets() {
        var now = OffsetDateTime.now();
        Order paid = new Order();
        paid.setExpiresAt(now.plusMinutes(1));
        assertTrue(paid.pay(Order.PaymentProvider.MOCK, "receipt", now));
        assertFalse(paid.pay(Order.PaymentProvider.MOCK, "receipt", now));
        assertThrows(IllegalStateException.class, paid::cancel);
        Order expired = new Order();
        expired.setExpiresAt(now.minusSeconds(1));
        assertThrows(
                IllegalStateException.class,
                () -> expired.pay(Order.PaymentProvider.MOCK, "receipt", now));
    }

    @Test
    void priceSnapshotRejectsFractionsAndNonPositiveQuantities() {
        assertEquals(
                new BigDecimal("200000"), new Money(new BigDecimal("100000")).multiply(2).amount());
        assertThrows(NullPointerException.class, () -> new Money(null));
        assertThrows(IllegalStateException.class, () -> new Money(new BigDecimal("0.5")));
        assertThrows(IllegalStateException.class, () -> new Money(BigDecimal.ONE).multiply(0));
    }

    @Test
    void aggregateOwnsPricedLinesAndRejectsTotalMismatch() {
        var order =
                Order.awaitingPayment(
                        java.util.UUID.randomUUID(),
                        java.util.UUID.randomUUID(),
                        new Money(new BigDecimal("200000")),
                        "request",
                        OffsetDateTime.now().plusMinutes(1));
        order.setId(java.util.UUID.randomUUID());
        var line = OrderItem.priced(java.util.UUID.randomUUID(), 2, new BigDecimal("100000"));
        assertThrows(
                IllegalStateException.class,
                () ->
                        order.addItems(
                                java.util.List.of(
                                        OrderItem.priced(
                                                java.util.UUID.randomUUID(), 1, BigDecimal.ONE))));
        assertTrue(order.getItems().isEmpty());
        order.addItems(java.util.List.of(line));
        assertEquals(order.getId(), line.getOrderId());
        assertThrows(UnsupportedOperationException.class, () -> order.getItems().clear());
        assertThrows(IllegalStateException.class, () -> order.addItems(java.util.List.of(line)));
        assertThrows(
                IllegalStateException.class,
                () -> order.pay(Order.PaymentProvider.MOCK, "", OffsetDateTime.now()));
        assertEquals(Order.Status.AWAITING_PAYMENT, order.getStatus());
    }
}
