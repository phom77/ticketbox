package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.SalesControlStore.QueueItem;
import org.ticketbox.catalog.performance.application.SalesControlStore.Request;
import org.ticketbox.catalog.performance.domain.PerformanceRules;

/**
 * Organizer requests to cancel or postpone a released performance. A request commits nothing: platform operations
 * accept it by confirming the performance disruption (see {@link PerformanceDisruptions}) or decline it here.
 */
@Service
public class PerformanceDisruptionRequests {
    private static final List<String> STATES = List.of("REQUESTED", "ACCEPTED", "DECLINED", "WITHDRAWN");

    private final SalesControlStore controls;
    private final PerformanceSalesControls sales;
    private final EventContentStore audit;

    public PerformanceDisruptionRequests(SalesControlStore controls, PerformanceSalesControls sales,
                                         EventContentStore audit) {
        this.controls = controls;
        this.sales = sales;
        this.audit = audit;
    }

    public record Command(String kind, String reason, OffsetDateTime proposedStartsAt, OffsetDateTime proposedEndsAt,
                          OffsetDateTime proposedDoorsOpenAt, boolean alsoPause) {}

    @Transactional
    public Request create(UUID owner, UUID actor, UUID id, Command command) {
        if (command == null || !List.of("CANCEL", "POSTPONE").contains(command.kind())
                || !PerformanceRules.text(command.reason(), 1_000)) throw invalid();
        var performance = sales.owned(owner, id);
        if (!List.of("ON_SALE", "SOLD_OUT").contains(performance.status()) || sales.openDisruption(id)
                || controls.openRequest(id).isPresent()) throw invalid();
        boolean postpone = "POSTPONE".equals(command.kind());
        if (postpone) {
            var starts = command.proposedStartsAt();
            var ends = command.proposedEndsAt();
            if (starts == null || ends == null || !starts.isAfter(OffsetDateTime.now()) || !ends.isAfter(starts)
                    || (command.proposedDoorsOpenAt() != null && command.proposedDoorsOpenAt().isAfter(starts))) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-proposed-schedule");
            }
        }
        var request = new Request(UUID.randomUUID(), id, owner, command.kind(), command.reason().strip(),
                postpone ? command.proposedStartsAt() : null, postpone ? command.proposedEndsAt() : null,
                postpone ? command.proposedDoorsOpenAt() : null, "REQUESTED", actor, null, null, null, null, null);
        controls.insertRequest(request);
        if (command.alsoPause()) {
            String reason = command.reason().strip();
            sales.pause(owner, actor, id, UUID.randomUUID(), reason.length() > 500 ? reason.substring(0, 500) : reason);
        }
        audit.audit(actor, owner, "DISRUPTION_REQUESTED", id, command.kind());
        return controls.request(request.id()).orElseThrow();
    }

    @Transactional
    public List<Request> list(UUID owner, UUID id) {
        sales.owned(owner, id);
        return controls.requests(id);
    }

    @Transactional
    public Request withdraw(UUID owner, UUID actor, UUID id, UUID requestId) {
        sales.owned(owner, id);
        var request = controls.request(requestId).filter(value -> value.performanceId().equals(id))
                .orElseThrow(PerformanceDisruptionRequests::missing);
        if ("WITHDRAWN".equals(request.state())) return request;
        if (!controls.close(requestId, "WITHDRAWN", actor, null)) throw invalid();
        audit.audit(actor, owner, "DISRUPTION_REQUEST_WITHDRAWN", id, requestId.toString());
        return controls.request(requestId).orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<QueueItem> queue(String state) {
        String value = state == null || state.isBlank() ? "REQUESTED" : state.strip();
        if (!STATES.contains(value)) throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-request-state");
        return controls.queue(value);
    }

    @Transactional(readOnly = true)
    public QueueItem item(UUID requestId) {
        return controls.queueItem(requestId).orElseThrow(PerformanceDisruptionRequests::missing);
    }

    @Transactional
    public QueueItem decline(UUID requestId, UUID actor, String reason) {
        if (!PerformanceRules.text(reason, 1_000)) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.decline-reason");
        }
        var request = controls.request(requestId).orElseThrow(PerformanceDisruptionRequests::missing);
        if ("DECLINED".equals(request.state()) && actor.equals(request.decidedBy())) return item(requestId);
        if (!controls.close(requestId, "DECLINED", actor, reason.strip())) throw invalid();
        audit.audit(actor, request.organizationId(), "DISRUPTION_REQUEST_DECLINED", request.performanceId(),
                requestId.toString());
        return item(requestId);
    }

    private static AppException invalid() {
        return new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.performance.invalid-disruption-request");
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }
}
