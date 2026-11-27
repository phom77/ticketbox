package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Kind;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore.Operation;
import org.ticketbox.catalog.performance.application.PerformanceDisruptionStore.Entry;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.domain.PerformanceRules;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

@Service
public class PerformanceDisruptions {
    private final PerformanceStore performances;
    private final PerformanceDisruptionStore disruptions;
    private final EventDisruptionImpact impacts;

    public PerformanceDisruptions(
            PerformanceStore performances, PerformanceDisruptionStore disruptions, EventDisruptionImpact impacts) {
        this.performances = performances;
        this.disruptions = disruptions;
        this.impacts = impacts;
    }

    public record Command(
            UUID actionId, Kind kind, String reason, OffsetDateTime startsAt, OffsetDateTime endsAt,
            OffsetDateTime doorsOpenAt, OffsetDateTime saleStartAt, OffsetDateTime saleEndAt,
            List<PerformanceSale.Offer> offers) {}

    public record Status(UUID id, Kind kind, String state, String reason, OffsetDateTime startsAt,
                         boolean ticketingAcknowledged, boolean checkinAcknowledged, boolean dispatched) {}

    @Transactional(readOnly = true)
    public Status status(UUID performance) {
        performances.nativeOwner(performance).orElseThrow(PerformanceDisruptions::missing);
        return disruptions.current(performance).map(PerformanceDisruptions::status).orElse(null);
    }

    public EventDisruptionImpact.Page impact(UUID performance, int page, int size) {
        performances.nativeOwner(performance).orElseThrow(PerformanceDisruptions::missing);
        if (page < 0 || size < 1 || size > 100) throw invalid();
        UUID action = disruptions.current(performance).filter(Entry::dispatched)
                .map(entry -> entry.operation().id()).orElse(null);
        return impacts.impact(performance, action, page, size);
    }

    @Transactional
    public Status confirm(UUID id, UUID actor, Command request) {
        if (request.actionId() == null || request.kind() == null || !PerformanceRules.text(request.reason(), 1_000)) {
            throw invalid();
        }
        var performance = lock(id);
        var replay = disruptions.find(request.actionId());
        if (replay.isPresent()) {
            var saved = replay.orElseThrow();
            if (!saved.operation().concertId().equals(id) || !saved.operation().actorId().equals(actor)
                    || !saved.command().equals(request)) throw invalid();
            return status(saved);
        }
        if (performance.salesSuspended() || !List.of("ON_SALE", "SOLD_OUT").contains(performance.status())
                || !performances.publication(performance).ticketingAcknowledged()) throw invalid();
        var sale = performances.sale(id);
        boolean postpone = request.kind() == Kind.POSTPONE;
        if (postpone) {
            PerformanceRules.validateSchedule(request.startsAt(), request.endsAt(), request.doorsOpenAt(),
                    performance.timezone(), request.saleStartAt(), request.saleEndAt(), performance.maxPerAccount());
            if (!request.saleEndAt().isAfter(OffsetDateTime.now())) throw invalid();
            if (request.offers() != null) sale = new PerformanceSale(sale.groups(), request.offers());
            PerformanceRules.validateSale(sale, request.saleStartAt(), request.saleEndAt(),
                    performances.draftLayout(id).map(PerformanceViews.Layout::layout).orElse(null), false,
                    performance.maxPerAccount());
            if (!PerformanceCatalog.retainsOfferScopes(performances.sale(id), sale)) throw invalid();
            performances.changeTiming(id, request.startsAt(), request.endsAt(), request.doorsOpenAt(),
                    request.saleStartAt(), request.saleEndAt(), null);
            performance = lock(id);
        }
        long version = performance.saleVersion() + 1;

        var action = new Operation(request.actionId(), id, request.kind(), request.reason().strip(), actor,
                postpone ? performance.startsAt() : null);
        performances.saveSale(id, version, sale);
        publish(performance, actor, version, postpone ? performance.status() : "CANCELLED", true, null, sale);
        disruptions.insert(action, request, version);
        return status(disruptions.find(action.id()).orElseThrow());
    }

    @Transactional
    public Status resume(UUID id, UUID action, UUID actor) {
        var performance = lock(id);
        var entry = disruptions.find(action).filter(value -> value.operation().concertId().equals(id))
                .orElseThrow(PerformanceDisruptions::missing);
        if (entry.resumeVersion() != null) return status(entry);
        if (entry.operation().kind() != Kind.POSTPONE || !entry.dispatched() || !performance.salesSuspended()
                || !performance.saleEndAt().isAfter(OffsetDateTime.now())) throw invalid();
        var resumedAt = performance.doorsOpenAt() == null ? performance.startsAt() : performance.doorsOpenAt();
        performances.changeTiming(id, performance.startsAt(), performance.endsAt(), performance.doorsOpenAt(),
                performance.saleStartAt(), performance.saleEndAt(), resumedAt);
        long version = performance.saleVersion() + 1;
        publish(performance, actor, version, performance.status(), false, resumedAt, performances.sale(id));
        disruptions.resume(action, version, actor);
        return status(disruptions.find(action).orElseThrow());
    }

    @Transactional
    public PerformanceViews.Publication complete(UUID id, UUID actor) {
        var performance = lock(id);
        if ("COMPLETED".equals(performance.status())) return performances.publication(performance);
        if (performance.salesSuspended() || !List.of("ON_SALE", "SOLD_OUT").contains(performance.status())
                || performance.endsAt().isAfter(OffsetDateTime.now())
                || !performances.publication(performance).ticketingAcknowledged()) throw invalid();
        long version = performance.saleVersion() + 1;
        publish(performance, actor, version, "COMPLETED", false,
                performance.resumedAdmissionAt(), performances.sale(id));
        return new PerformanceViews.Publication("COMPLETED", version, false, false);
    }

    private void publish(Performance performance, UUID actor, long version, String status, boolean suspended,
                         OffsetDateTime resumedAdmissionAt, PerformanceSale sale) {
        UUID owner = performances.nativeOwner(performance.id()).orElseThrow(PerformanceDisruptions::missing);
        var event = performances.event(performance.eventId(), owner).orElseThrow(PerformanceDisruptions::missing);
        String checksum = performance.layoutVersion() == null ? null
                : performances.layoutChecksum(performance.id(), performance.layoutVersion());
        performances.savePublication(PerformanceCatalog.snapshot(performance, event, owner, version,
                performance.layoutVersion(), checksum, status, suspended, resumedAdmissionAt, sale), actor,
                performance.layoutVersion(), status, suspended);
    }

    private Performance lock(UUID id) {
        return performances.lockNativePerformance(id).orElseThrow(PerformanceDisruptions::missing);
    }

    private static Status status(Entry entry) {
        var operation = entry.operation();
        String state;
        if (entry.resumeVersion() != null) {
            state = entry.ticketingAcknowledged() && entry.checkinAcknowledged() ? "RESUMED" : "RESUMING";
        } else if (!entry.dispatched()) {
            state = "PAUSING";
        } else {
            state = operation.kind() == Kind.POSTPONE ? "PAUSED" : "CANCELLED";
        }
        return new Status(operation.id(), operation.kind(), state, operation.reason(), operation.eventDate(),
                entry.ticketingAcknowledged(), entry.checkinAcknowledged(), entry.dispatched());
    }

    private static AppException invalid() {
        return new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.performance.invalid-disruption");
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }
}
