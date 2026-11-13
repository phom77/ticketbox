package org.ticketbox.ticketing.order.application;

import com.ticketbox.shared.event.RemoteNotificationRequested;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.order.application.port.EventDisruptionStore;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Service
public class EventDisruptionImpact {
    private final EventDisruptionStore store;
    private final ApplicationEventPublisher events;

    public EventDisruptionImpact(EventDisruptionStore store, ApplicationEventPublisher events) {
        this.store = store;
        this.events = events;
    }

    @Transactional
    public void accept(EventDisruptionStore.Operation operation) {
        if (operation.id() == null || operation.concertId() == null || operation.kind() == null
                || operation.actorId() == null || operation.reason() == null || operation.reason().isBlank()
                || operation.reason().length() > 1000 || !store.accept(operation)) throw new AppException(ErrorCode.INVALID_REQUEST);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public EventDisruptionStore.Impact impact(UUID concert, UUID operation, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new AppException(ErrorCode.INVALID_REQUEST);
        return store.impact(concert, operation, page, size);
    }

    @Transactional
    public void prepareWork() {
        store.enqueueRefunds();
        for (var notice : store.notices()) {
            var operation = notice.operation();
            UUID id = UUID.nameUUIDFromBytes(("disruption-notice:" + operation.id() + ":" + notice.userId()).getBytes(StandardCharsets.UTF_8));
            boolean cancelled = operation.kind() == EventDisruptionStore.Kind.CANCEL;
            String type = cancelled ? "ticketing.event-cancelled" : "ticketing.event-postponed";
            events.publishEvent(new RemoteNotificationRequested(1, type, id, operation.concertId(), notice.userId(),
                    OffsetDateTime.now(), operation.id().toString(), Map.of("concertId", operation.concertId(),
                    "concertTitle", notice.title(), "eventDate", operation.eventDate() == null ? "" : operation.eventDate().toString())));
        }
    }
}
