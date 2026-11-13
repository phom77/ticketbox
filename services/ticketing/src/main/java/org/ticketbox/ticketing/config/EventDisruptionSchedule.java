package org.ticketbox.ticketing.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.order.application.EventDisruptionImpact;
import org.ticketbox.ticketing.order.application.port.EventDisruptionStore;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

@Component
class EventDisruptionSchedule {
    private final EventDisruptionImpact impact;
    private final EventDisruptionStore store;
    private final RefundProviders refunds;
    private final Optional<PaymentGatewayClient> payment;

    EventDisruptionSchedule(EventDisruptionImpact impact, EventDisruptionStore store,
            RefundProviders refunds, Optional<PaymentGatewayClient> payment) {
        this.impact = impact;
        this.store = store;
        this.refunds = refunds;
        this.payment = payment;
    }

    @Scheduled(fixedDelayString = "${ticketbox.disruption.interval-ms:5000}")
    public void process() {
        impact.prepareWork();
        for (var work : store.pendingRefunds()) {
            var operation = work.operation();
            UUID id = UUID.nameUUIDFromBytes(("disruption-refund:" + operation.id() + ":" + work.orderId()).getBytes(StandardCharsets.UTF_8));
            boolean prepared = false;
            try {
                var details = payment.map(provider -> provider.support(work.orderId()));
                prepared = details.isPresent() && !details.orElseThrow().cases().isEmpty();
                if (!prepared) {
                    var command = new RefundProviders.Command(id, operation.actorId(), null,
                            RefundProviders.Action.REQUEST, operation.reason(), null, null, null);
                    prepared = refunds.apply(work.orderId(), command) != null;
                }
            } catch (RuntimeException unavailable) {
                // Other orders can advance while this receipt or Payment service is unavailable.
            }
            store.finish(work, prepared);
        }
    }
}
