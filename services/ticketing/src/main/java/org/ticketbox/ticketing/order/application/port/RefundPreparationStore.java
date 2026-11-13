package org.ticketbox.ticketing.order.application.port;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundPreparationStore {
    enum State { PREPARED, CONFIRMED, ABORTED }
    record Preparation(UUID caseId, UUID orderId, List<UUID> ticketIds, State state,
                       boolean compensation, String reference) {}

    Optional<Preparation> find(UUID orderId);
    void insert(Preparation preparation);
    void finish(UUID caseId, State state, String reference);
}
