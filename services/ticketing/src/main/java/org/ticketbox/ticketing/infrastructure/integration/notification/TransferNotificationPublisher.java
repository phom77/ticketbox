package org.ticketbox.ticketing.infrastructure.integration.notification;

import com.ticketbox.shared.event.RemoteNotificationRequested;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.issuance.application.port.TicketTransferStore.Detail;
import org.ticketbox.ticketing.issuance.application.port.TransferNotifier;
import org.ticketbox.ticketing.issuance.domain.TicketTransfer;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Locale;
import java.util.UUID;

/** Records one notification command per person in the transaction outbox; the remote listener delivers them. */
@Component
class TransferNotificationPublisher implements TransferNotifier {
    private final ApplicationEventPublisher events;

    TransferNotificationPublisher(ApplicationEventPublisher events) {
        this.events = events;
    }

    @Override
    public void notifyBoth(Kind kind, TicketTransfer transfer, Detail context) {
        send(kind, transfer, context, transfer.senderId(), "SENDER", transfer.recipientName());
        send(kind, transfer, context, transfer.recipientId(), "RECIPIENT", transfer.senderName());
    }

    private void send(Kind kind, TicketTransfer transfer, Detail context, UUID userId, String role,
            String otherPartyName) {
        String type = "ticketing.ticket-transfer-" + kind.name().toLowerCase(Locale.ROOT);
        UUID eventId = UUID.nameUUIDFromBytes(
                ("ticket-transfer:" + transfer.id() + ":" + kind + ":" + userId).getBytes(StandardCharsets.UTF_8));
        var payload = new HashMap<String, Object>();
        payload.put("transferId", transfer.id());
        payload.put("ticketId", transfer.ticketId());
        payload.put("concertId", context.concertId());
        payload.put("concertTitle", context.concertTitle());
        payload.put("eventDate", context.eventDate() == null ? "" : context.eventDate().toString());
        payload.put("role", role);
        payload.put("otherPartyName", otherPartyName);
        events.publishEvent(new RemoteNotificationRequested(1, type, eventId, transfer.id(), userId,
                OffsetDateTime.now(), eventId.toString(), payload));
    }
}
