package org.ticketbox.catalog.performance.application;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.WorkspaceOperationsStore.*;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class WorkspaceOperations {
    private static final ZoneId REPORT_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Duration MAX_PERIOD = Duration.ofDays(366);
    private final WorkspaceOperationsStore store;

    public WorkspaceOperations(WorkspaceOperationsStore store) {
        this.store = store;
    }

    public record EventDetail(EventRow event, List<PerformanceRow> performances) {}

    public Page<EventRow> events(UUID owner, EventFilters filters, Pageable page) {
        UUID organization = scope(owner, filters.organizationId());
        return store.events(new EventFilters(search(filters.query()), filters.status(), organization), page);
    }

    public EventDetail event(UUID id) {
        var event = store.event(id).orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND));
        return new EventDetail(event, store.eventPerformances(id));
    }

    public Page<PerformanceRow> performances(UUID owner, ReportFilters filters, Pageable page) {
        UUID organization = scope(owner, filters.organizationId());
        OffsetDateTime from = filters.from();
        OffsetDateTime to = filters.to();
        OffsetDateTime asOf = filters.asOf() == null ? OffsetDateTime.now(REPORT_ZONE) : filters.asOf();
        if (filters.status() == ReportStatus.UPCOMING && from == null && to == null && validDate(asOf)) {
            from = asOf;
            to = asOf.atZoneSameInstant(REPORT_ZONE).plusDays(7).toOffsetDateTime();
        }
        if (!validDate(from) || !validDate(to) || !validDate(asOf)
                || (from != null && to != null && (!to.isAfter(from) || Duration.between(from, to).compareTo(MAX_PERIOD) > 0))) {
            throw new AppException(ErrorCode.INVALID_DATE, "error.performance.invalid-operations-period");
        }
        return store.performances(new ReportFilters(organization, filters.eventId(), filters.performanceId(),
                filters.concertId(), filters.status(), from, to, asOf), page);
    }

    public Page<ReviewRow> reviews(ReviewFilters filters, Pageable page) {
        var status = filters.status() == null ? ReviewStatus.SUBMITTED : filters.status();
        return store.reviews(new ReviewFilters(filters.organizationId(), filters.eventId(), filters.performanceId(),
                filters.concertId(), status, search(filters.query())), page);
    }

    private static UUID scope(UUID owner, UUID organization) {
        if (owner != null && organization != null && !owner.equals(organization)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        return owner == null ? organization : owner;
    }

    private static String search(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String term = query.strip();
        if (term.length() > 200) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-operations-search");
        }
        return term;
    }

    private static boolean validDate(OffsetDateTime date) {
        return date == null || (date.getYear() >= 1 && date.getYear() <= 9999);
    }
}
