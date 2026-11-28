package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.domain.PerformanceRules;
import org.ticketbox.catalog.performance.application.SalesControlStore.Pause;

/**
 * Organizer pause and resume of sales. A pause publishes the next sale version with `sales_suspended` set, through
 * the same publication path postponement uses, so Ticketing applies it like any newer snapshot. Pausing is
 * only possible before doors open; a pause still open then is resumed automatically. Platform
 * disruptions take precedence: confirming one closes an open pause.
 */
@Service
public class PerformanceSalesControls {
    /** The actor recorded for automatic resumes. */
    static final UUID SYSTEM = new UUID(0L, 0L);

    private final PerformanceStore performances;
    private final SalesControlStore controls;
    private final PerformanceDisruptionStore disruptions;
    private final EventContentStore audit;

    public PerformanceSalesControls(PerformanceStore performances, SalesControlStore controls,
                                    PerformanceDisruptionStore disruptions, EventContentStore audit) {
        this.performances = performances;
        this.controls = controls;
        this.disruptions = disruptions;
        this.audit = audit;
    }

    /** PAUSING and RESUMING last until Ticketing acknowledges the published version. */
    public record PauseStatus(UUID id, String state, String reason, OffsetDateTime pausedAt, OffsetDateTime closedAt,
                              boolean ticketingAcknowledged) {}

    public record SalesState(String status, boolean salesSuspended, boolean ticketingAcknowledged, PauseStatus pause,
                             SalesControlStore.Request request, PerformanceDisruptions.Status disruption) {}

    @Transactional
    public PauseStatus pause(UUID owner, UUID actor, UUID id, UUID actionId, String reason) {
        if (actionId == null || !PerformanceRules.text(reason, 500)) throw invalid();
        var performance = owned(owner, id);
        var replay = controls.pause(actionId);
        if (replay.isPresent()) {
            if (!replay.orElseThrow().performanceId().equals(id)) throw invalid();
            return status(replay.orElseThrow());
        }
        if (!List.of("ON_SALE", "SOLD_OUT").contains(performance.status()) || performance.salesSuspended()
                || !performance.endsAt().isAfter(OffsetDateTime.now()) || openDisruption(id)
                || !performances.publication(performance).ticketingAcknowledged()) throw invalid();
        // Check-in reads a suspended sale as a closed performance, so a pause may not reach the doors.
        if (!OffsetDateTime.now().isBefore(doorsOpen(performance))) throw closed();
        long version = performance.saleVersion() + 1;
        publish(performance, owner, actor, version, true);
        controls.insertPause(actionId, id, reason.strip(), actor, version);
        audit.audit(actor, owner, "SALES_PAUSED", id, "version " + version);
        return status(controls.pause(actionId).orElseThrow());
    }

    @Transactional
    public PauseStatus resume(UUID owner, UUID actor, UUID id, UUID pauseId) {
        if (pauseId == null) throw invalid();
        var performance = owned(owner, id);
        var pause = controls.pause(pauseId).filter(value -> value.performanceId().equals(id))
                .orElseThrow(PerformanceSalesControls::missing);
        if ("RESUMED".equals(pause.closedReason())) return status(pause);
        if (pause.closedReason() != null || openDisruption(id) || !performance.salesSuspended()
                || !performance.saleEndAt().isAfter(OffsetDateTime.now())) throw invalid();
        long version = performance.saleVersion() + 1;
        publish(performance, owner, actor, version, false);
        controls.resumePause(pauseId, version, actor);
        audit.audit(actor, owner, "SALES_RESUMED", id, "version " + version);
        return status(controls.pause(pauseId).orElseThrow());
    }

    /**
     * Closes an organizer pause that is still open when the doors open, so Check-in admission is never blocked by it.
     * Idempotent: a pause that was resumed, superseded by a disruption, or is not due is left alone.
     */
    @Transactional
    public boolean resumeAtDoors(SalesControlStore.DuePause due) {
        var performance = performances.lockOwnedPerformance(due.performanceId(), due.organizationId()).orElse(null);
        var pause = controls.pause(due.id()).orElse(null);
        if (performance == null || pause == null || pause.closedReason() != null || !performance.salesSuspended()
                || OffsetDateTime.now().isBefore(doorsOpen(performance)) || openDisruption(performance.id())) {
            return false;
        }
        long version = performance.saleVersion() + 1;
        publish(performance, due.organizationId(), SYSTEM, version, false);
        controls.resumePause(pause.id(), version, SYSTEM);
        audit.audit(SYSTEM, due.organizationId(), "SALES_RESUMED_AT_DOORS", performance.id(), "version " + version);
        return true;
    }

    public List<SalesControlStore.DuePause> dueAtDoors() {
        return controls.dueAtDoors(OffsetDateTime.now());
    }

    @Transactional(readOnly = true)
    public SalesState state(UUID owner, UUID id) {
        var performance = performances.ownedPerformance(id, owner).orElseThrow(PerformanceSalesControls::missing);
        var publication = performances.publication(performance);
        return new SalesState(performance.status(), performance.salesSuspended(), publication.ticketingAcknowledged(),
                controls.latestPause(id).map(PerformanceSalesControls::status).orElse(null),
                controls.requests(id).stream().findFirst().orElse(null),
                disruptions.current(id).map(PerformanceDisruptions::status).orElse(null));
    }

    static OffsetDateTime doorsOpen(Performance performance) {
        return performance.doorsOpenAt() != null ? performance.doorsOpenAt() : performance.startsAt();
    }

    boolean openDisruption(UUID performance) {
        return disruptions.current(performance).filter(entry -> entry.resumeVersion() == null).isPresent();
    }

    Performance read(UUID owner, UUID id) {
        return performances.ownedPerformance(id, owner).orElseThrow(PerformanceSalesControls::missing);
    }

    Performance owned(UUID owner, UUID id) {
        return performances.lockOwnedPerformance(id, owner).orElseThrow(PerformanceSalesControls::missing);
    }

    private void publish(Performance performance, UUID owner, UUID actor, long version, boolean suspended) {
        var event = performances.event(performance.eventId(), owner).orElseThrow(PerformanceSalesControls::missing);
        String checksum = performance.layoutVersion() == null ? null
                : performances.layoutChecksum(performance.id(), performance.layoutVersion());
        performances.savePublication(PerformanceCatalog.snapshot(performance, event, owner, version,
                performance.layoutVersion(), checksum, performance.status(), suspended,
                performance.resumedAdmissionAt(), performances.sale(performance.id())), actor,
                performance.layoutVersion(), performance.status(), suspended);
    }

    private static PauseStatus status(Pause pause) {
        String state;
        if ("SUPERSEDED".equals(pause.closedReason())) state = "SUPERSEDED";
        else if ("RESUMED".equals(pause.closedReason())) state = pause.ticketingAcknowledged() ? "RESUMED" : "RESUMING";
        else state = pause.ticketingAcknowledged() ? "PAUSED" : "PAUSING";
        return new PauseStatus(pause.id(), state, pause.reason(), pause.createdAt(), pause.closedAt(),
                pause.ticketingAcknowledged());
    }

    private static AppException closed() {
        return new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.performance.sales-control-closed");
    }

    private static AppException invalid() {
        return new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.performance.invalid-sales-control");
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }
}
