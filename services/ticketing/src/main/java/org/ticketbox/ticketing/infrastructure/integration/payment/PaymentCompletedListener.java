package org.ticketbox.ticketing.infrastructure.integration.payment;

import com.ticketbox.shared.event.PaymentCompletedEvent;

import lombok.RequiredArgsConstructor;

import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.infrastructure.integration.notification.PaymentNotificationPublisher;
import org.ticketbox.ticketing.order.application.OrderService;

@Component
@RequiredArgsConstructor
public class PaymentCompletedListener {
    private final OrderService orderService;
    private final PaymentNotificationPublisher paymentNotificationPublisher;

    @ApplicationModuleListener(
            id =
                    "com.ticketbox.module.ticket.application.PaymentCompletedListener.on(com.ticketbox.shared.event.PaymentCompletedEvent)")
    @org.springframework.transaction.annotation.Transactional(
            propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    public void on(PaymentCompletedEvent event) {
        if (!orderService.handlePaymentSuccess(
                event.orderId(), event.provider(), event.providerRef())) return;
        paymentNotificationPublisher.publish(event);
    }
}
