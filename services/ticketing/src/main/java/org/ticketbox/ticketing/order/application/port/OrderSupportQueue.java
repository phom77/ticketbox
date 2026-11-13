package org.ticketbox.ticketing.order.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface OrderSupportQueue {
    enum Kind { UNKNOWN_PAYMENT, MISSING_TICKETS, PENDING_REFUND, FAILED_EMAIL }
    record Item(UUID orderId, UUID sourceId, String state, OffsetDateTime updatedAt, boolean retryable) {}
    record Page(List<Item> content, int page, int size, long totalElements, int totalPages) {}

    Page list(Kind kind, int page, int size);
}
