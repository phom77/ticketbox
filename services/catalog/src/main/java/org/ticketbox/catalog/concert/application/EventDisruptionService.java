package org.ticketbox.catalog.concert.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.ReadCache;
import org.ticketbox.catalog.concert.application.port.ConcertRepository;
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Entry;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Kind;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Operation;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.concert.domain.SaleWindow;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class EventDisruptionService {
    public record Command(UUID actionId, Kind kind, String reason, OffsetDateTime eventDate,
                          OffsetDateTime doorsOpenAt, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt) {}

    public record Status(UUID id, Kind kind, String state, String reason, OffsetDateTime eventDate,
                         boolean ticketingReady, boolean checkinReady, boolean processed) {}

    private final ConcertRepository concerts;
    private final EventDisruptionStore operations;
    private final EventDisruptionImpact impact;
    private final ReadCache cache;

    public EventDisruptionService(ConcertRepository concerts, EventDisruptionStore operations,
            EventDisruptionImpact impact, ReadCache cache) {
        this.concerts = concerts;
        this.operations = operations;
        this.impact = impact;
        this.cache = cache;
    }

    public Status status(UUID id) {
        return operations.current(id).map(this::status).orElse(null);
    }

    public EventDisruptionImpact.Page impact(UUID id, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw invalid();
        concerts.findById(id).orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found"));
        UUID operation = operations.current(id).filter(Entry::dispatched).map(entry -> entry.operation().id()).orElse(null);
        return impact.impact(id, operation, page, size);
    }

    @Transactional
    public Status confirm(UUID id, UUID actor, Command command) {
        if (command.actionId() == null || command.kind() == null || command.reason() == null
                || command.reason().isBlank() || command.reason().length() > 1000) throw invalid();
        Concert concert = locked(id);
        var replay = operations.find(command.actionId());
        if (replay.isPresent()) {
            var entry = replay.orElseThrow();
            var saved = entry.operation();
            if (!saved.concertId().equals(id) || !saved.actorId().equals(actor) || saved.kind() != command.kind()
                    || !saved.reason().equals(command.reason().strip())) throw invalid();
            if (saved.kind() == Kind.POSTPONE && (!sameInstant(saved.eventDate(), command.eventDate())
                    || !sameInstant(entry.window().doorsOpenAt(), command.doorsOpenAt())
                    || !sameInstant(entry.window().saleStartAt(), command.saleStartAt())
                    || !sameInstant(entry.window().saleEndAt(), command.saleEndAt()))) throw invalid();
            return status(entry);
        }
        if (concert.isSalesSuspended() || (concert.getStatus() != Concert.Status.ON_SALE
                && concert.getStatus() != Concert.Status.SOLD_OUT)) throw invalid();
        if (command.kind() == Kind.POSTPONE) {
            if (command.eventDate() == null) throw invalid();
            new SaleWindow(command.eventDate(), command.doorsOpenAt(), command.saleStartAt(), command.saleEndAt()).validate(OffsetDateTime.now());
            concert.setEventDate(command.eventDate());
            concert.setDoorsOpenAt(command.doorsOpenAt());
            concert.setSaleStartAt(command.saleStartAt());
            concert.setSaleEndAt(command.saleEndAt());
        } else {
            concert.changeStatus(Concert.Status.CANCELLED);
        }
        concert.suspendSales();
        concerts.saveAndFlush(concert);
        cache.evictAfterCommit(id);
        long version = concerts.publication(id).orElseThrow().version();
        var operation = new Operation(command.actionId(), id, command.kind(), command.reason().strip(), actor,
                command.kind() == Kind.POSTPONE ? concert.getEventDate() : null);
        var window = command.kind() == Kind.POSTPONE
                ? new EventDisruptionStore.Window(command.doorsOpenAt(), command.saleStartAt(), command.saleEndAt())
                : new EventDisruptionStore.Window(null, null, null);
        var entry = new Entry(operation, window, version, null, false);
        operations.insert(entry);
        return status(entry);
    }

    @Transactional
    public Status resume(UUID id, UUID operation, UUID actor) {
        Concert concert = locked(id);
        Entry entry = operations.find(operation).filter(current -> current.operation().concertId().equals(id))
                .orElseThrow(EventDisruptionService::invalid);
        if (entry.resumeVersion() != null) return status(entry);
        if (entry.operation().kind() != Kind.POSTPONE || !entry.dispatched() || !concert.isSalesSuspended()) throw invalid();
        new SaleWindow(concert.getEventDate(), concert.getDoorsOpenAt(), concert.getSaleStartAt(), concert.getSaleEndAt()).validate(OffsetDateTime.now());
        concert.resumeSales(concert.getDoorsOpenAt() == null ? concert.getEventDate() : concert.getDoorsOpenAt());
        concerts.saveAndFlush(concert);
        cache.evictAfterCommit(id);
        long version = concerts.publication(id).orElseThrow().version();
        operations.resume(operation, version, actor);
        return status(new Entry(entry.operation(), entry.window(), entry.pauseVersion(), version, true));
    }

    private Concert locked(UUID id) {
        return concerts.findByIdForUpdate(id).orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found"));
    }

    private Status status(Entry entry) {
        var op = entry.operation();
        var versions = concerts.publication(op.concertId()).orElseThrow();
        long target = entry.resumeVersion() == null ? entry.pauseVersion() : entry.resumeVersion();
        boolean ticketingReady = versions.ticketingVersion() >= target;
        boolean checkinReady = versions.checkinVersion() >= target;
        String state;
        if (entry.resumeVersion() != null) state = ticketingReady && checkinReady ? "RESUMED" : "RESUMING";
        else if (!entry.dispatched()) state = "PAUSING";
        else state = op.kind() == Kind.CANCEL ? "CANCELLED" : "PAUSED";
        return new Status(op.id(), op.kind(), state, op.reason(), op.eventDate(), ticketingReady, checkinReady, entry.dispatched());
    }

    private static AppException invalid() { return new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.invalid-disruption"); }

    private static boolean sameInstant(OffsetDateTime saved, OffsetDateTime requested) {
        return saved == null ? requested == null : requested != null
                && saved.toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS)
                .equals(requested.toInstant().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
    }
}
