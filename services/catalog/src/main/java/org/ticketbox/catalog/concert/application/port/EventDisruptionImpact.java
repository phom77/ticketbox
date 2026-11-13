package org.ticketbox.catalog.concert.application.port;

import java.util.List;
import java.util.UUID;

public interface EventDisruptionImpact {
    record Item(UUID orderId, String status, String paymentState, long amount, boolean casePrepared) {}
    record Page(List<Item> content, int page, int size, long totalElements, int totalPages) {}
    Page impact(UUID concert, UUID operation, int page, int size);
    void register(EventDisruptionStore.Operation operation);
}
