package org.ticketbox.ticketing.order.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface EventDisruptionStore {
    enum Kind { CANCEL, POSTPONE }
    record Operation(UUID id, UUID concertId, Kind kind, String reason, UUID actorId, OffsetDateTime eventDate) {}
    record Notice(Operation operation, UUID userId, String title) {}
    record PendingRefund(Operation operation, UUID orderId) {}
    record Item(UUID orderId, String status, String paymentState, long amount, boolean casePrepared) {}
    record Impact(List<Item> content, int page, int size, long totalElements, int totalPages) {}

    boolean accept(Operation operation);
    Impact impact(UUID concert, UUID operation, int page, int size);
    List<Notice> notices();
    void enqueueRefunds();
    List<PendingRefund> pendingRefunds();
    void finish(PendingRefund work, boolean prepared);
}
