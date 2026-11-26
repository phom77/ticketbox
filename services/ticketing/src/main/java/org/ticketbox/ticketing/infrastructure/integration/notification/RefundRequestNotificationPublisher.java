package org.ticketbox.ticketing.infrastructure.integration.notification;

import com.ticketbox.shared.event.RemoteNotificationRequested;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.order.application.port.RefundRequestNotifier;
import org.ticketbox.ticketing.order.application.port.RefundRequestStore.Row;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Locale;
import java.util.UUID;

/** Records one notification command per change in the transaction outbox; the remote listener delivers it. */
@Component
class RefundRequestNotificationPublisher implements RefundRequestNotifier {
    private final ApplicationEventPublisher events;

    RefundRequestNotificationPublisher(ApplicationEventPublisher events) {
        this.events = events;
    }

    @Override
    public void notifyBuyer(Kind kind, Row context) {
        var request = context.request();
        String type = "ticketing.refund-request-" + kind.name().toLowerCase(Locale.ROOT);
        UUID eventId = UUID.nameUUIDFromBytes(("refund-request:" + request.id() + ":" + kind).getBytes(StandardCharsets.UTF_8));
        var payload = new HashMap<String, Object>();
        payload.put("refundRequestId", request.id());
        payload.put("orderId", request.orderId());
        payload.put("concertId", context.concertId());
        payload.put("concertTitle", context.concertTitle());
        if (context.orderReference() != null) payload.put("orderReference", context.orderReference());
        if (kind == Kind.REJECTED && request.decisionNote() != null) payload.put("note", request.decisionNote());
        events.publishEvent(new RemoteNotificationRequested(1, type, eventId, request.id(), request.buyerId(),
                OffsetDateTime.now(), eventId.toString(), payload));
    }
}
