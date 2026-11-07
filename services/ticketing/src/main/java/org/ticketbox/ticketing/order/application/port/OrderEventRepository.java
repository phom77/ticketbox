package org.ticketbox.ticketing.order.application.port;

import org.ticketbox.ticketing.order.domain.Order;

import java.util.UUID;

public interface OrderEventRepository {
    void created(UUID orderId);

    long restore(Order order);

    void record(Order order, long expectedVersion, Transition transition);

    public enum Transition {
        OrderPaymentInitiated,
        OrderPaid,
        OrderExpired,
        OrderCancelled
    }
}
