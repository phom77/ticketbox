package org.ticketbox.catalog.concert.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EventDisruptionStore {
    enum Kind { CANCEL, POSTPONE }
    record Operation(UUID id, UUID concertId, Kind kind, String reason, UUID actorId, OffsetDateTime eventDate) {}
    record Window(OffsetDateTime doorsOpenAt, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt) {}
    record Entry(Operation operation, Window window, long pauseVersion, Long resumeVersion, boolean dispatched) {}

    Optional<Entry> find(UUID id);
    Optional<Entry> current(UUID concertId);
    void insert(Entry entry);
    void resume(UUID id, long version, UUID actor);
    List<Operation> readyToDispatch();
    void dispatched(UUID id);
}
