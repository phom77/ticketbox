package org.ticketbox.catalog.performance.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Operation;
import org.ticketbox.catalog.performance.application.PerformanceDisruptions.Command;

public interface PerformanceDisruptionStore {
    record Entry(Operation operation, Command command, long pauseVersion, Long resumeVersion,
                 boolean dispatched, boolean ticketingAcknowledged, boolean checkinAcknowledged) {}

    Optional<Entry> find(UUID id);

    Optional<Entry> current(UUID performance);

    void insert(Operation operation, Command command, long version);

    void resume(UUID id, long version, UUID actor);

    List<Operation> claimReady();

    void dispatched(UUID id);
}
