package org.ticketbox.ticketing.reporting.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.reporting.application.port.OrganizationProfiles;
import org.ticketbox.ticketing.reporting.application.port.StatementLogoFetcher;
import org.ticketbox.ticketing.reporting.application.port.StatementRenderer;
import org.ticketbox.ticketing.reporting.application.port.StatementStore;
import org.ticketbox.ticketing.reporting.application.port.StatementStore.ScopeState;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.OrganizationDetails;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.ScopeDetails;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DateTimeException;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * Issues and reads settlement statements (ADR 0007). A statement is immutable once issued: a later revision supersedes
 * it. Reading never needs Identity; issuing does, to capture the organization's statement details.
 */
@Service
public class SettlementStatementService {
    public record Eligible(String scopeType, UUID scopeId, UUID eventId, String title, String eventTitle,
                           OffsetDateTime startsAt, OffsetDateTime endsAt, int performanceCount, long ticketsSold,
                           long netSales, UUID statementId, String statementNumber, Integer statementRevision,
                           boolean outOfDate) {}

    public record Page<T>(List<T> content, int page, int size, boolean hasMore) {}

    public record IssueResult(SettlementStatement statement, boolean logoOmitted) {}

    /** The request used an old revision, or the scope already has an up-to-date statement. */
    public static class StatementConflict extends RuntimeException {
        private final transient SettlementStatement current;

        StatementConflict(SettlementStatement current) {
            super("error.statement.conflict");
            this.current = current;
        }

        public SettlementStatement current() {
            return current;
        }
    }

    private final StatementStore store;
    private final OrganizationProfiles profiles;
    private final StatementLogoFetcher logos;
    private final StatementRenderer renderer;
    private final TransactionTemplate transaction;

    public SettlementStatementService(StatementStore store, OrganizationProfiles profiles, StatementLogoFetcher logos,
                                      StatementRenderer renderer, TransactionTemplate transaction) {
        this.store = store;
        this.profiles = profiles;
        this.logos = logos;
        this.renderer = renderer;
        this.transaction = transaction;
    }

    @Transactional(readOnly = true)
    public Page<Eligible> eligible(UUID organization, String search, int page, int size) {
        int limit = Math.clamp(size, 1, 50);
        int index = Math.max(page, 0);
        var current = new java.util.HashMap<String, SettlementStatement>();
        store.currentStatements(organization)
                .forEach(s -> current.put(s.scopeType() + ":" + s.scopeId(), s));
        List<ScopeState> ready = store.candidates(organization, search).stream().filter(ScopeState::allFinal)
                .filter(scope -> {
                    var statement = current.get(scope.type() + ":" + scope.scopeId());
                    return statement == null || store.outOfDate(statement);
                })
                .sorted(Comparator.comparing(ScopeState::endsAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        int from = Math.min(index * limit, ready.size());
        int to = Math.min(from + limit, ready.size());
        var content = ready.subList(from, to).stream().map(scope -> {
            long[] net = store.netToDate(organization, scope);
            var statement = current.get(scope.type() + ":" + scope.scopeId());
            return new Eligible(scope.type(), scope.scopeId(), scope.eventId(), scope.title(), scope.eventTitle(),
                    scope.startsAt(), scope.endsAt(), scope.performances(), net[1], net[0],
                    statement == null ? null : statement.id(), statement == null ? null : statement.number(),
                    statement == null ? null : statement.revision(), statement != null);
        }).toList();
        return new Page<>(content, index, limit, to < ready.size());
    }

    @Transactional(readOnly = true)
    public Page<SettlementStatement> list(UUID organization, UUID eventId, int page, int size) {
        int limit = Math.clamp(size, 1, 50);
        int index = Math.max(page, 0);
        var rows = store.list(organization, eventId, index * limit, limit + 1);
        var content = rows.stream().limit(limit).map(s -> s.withOutOfDate(
                SettlementStatement.CURRENT.equals(s.status()) && store.outOfDate(s))).toList();
        return new Page<>(content, index, limit, rows.size() > limit);
    }

    @Transactional(readOnly = true)
    public SettlementStatement detail(UUID organization, UUID id) {
        var statement = store.find(organization, id).orElseThrow(StatementNotFound::new);
        return statement.withOutOfDate(SettlementStatement.CURRENT.equals(statement.status())
                && store.outOfDate(statement));
    }

    @Transactional(readOnly = true)
    public RevenueReportExport download(UUID organization, UUID id, String format) {
        String kind = format == null ? "" : format.trim().toLowerCase(Locale.ROOT);
        if (!kind.equals("pdf") && !kind.equals("csv")) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.statement.unsupported-format");
        }
        var statement = store.find(organization, id).orElseThrow(StatementNotFound::new);
        if (kind.equals("pdf")) {
            byte[] pdf = store.pdf(organization, id).orElseThrow(StatementNotFound::new);
            return new RevenueReportExport(pdf, "application/pdf", statement.number() + ".pdf");
        }
        return new RevenueReportExport(renderer.csv(statement), "text/csv;charset=UTF-8", statement.number() + ".csv");
    }

    public IssueResult issue(UUID organization, UUID actor, String scopeType, UUID scopeId, int expectedRevision) {
        String type = scopeType == null ? "" : scopeType.trim().toUpperCase(Locale.ROOT);
        if (!type.equals(SettlementStatement.PERFORMANCE) && !type.equals(SettlementStatement.EVENT)
                || scopeId == null || expectedRevision < 0) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
        }
        requireFinal(store.scope(organization, type, scopeId).orElseThrow(StatementNotFound::new));
        var profile = profiles.fetch(organization);
        byte[] logo = profile.logoPngUrl() == null ? null : logos.fetch(profile.logoPngUrl()).orElse(null);
        boolean logoOmitted = profile.logoUrl() != null && logo == null;
        byte[] logoBytes = logo;
        var issued = Objects.requireNonNull(transaction.execute(status -> {
            store.lock(organization, type, scopeId);
            var scope = store.scope(organization, type, scopeId).orElseThrow(StatementNotFound::new);
            requireFinal(scope);
            var current = store.current(organization, type, scopeId);
            int revision = current.map(SettlementStatement::revision).orElse(0);
            if (revision != expectedRevision
                    || current.isPresent() && !store.outOfDate(current.get())) {
                throw new StatementConflict(current.map(c -> c.withOutOfDate(store.outOfDate(c))).orElse(null));
            }
            OffsetDateTime cutoff = store.now();
            var figures = store.figures(organization, scope, cutoff);
            ZoneId zone = scope.ownZone() != null ? scope.ownZone() : zoneOf(profile.reportingTimezone());
            String number = number(current.orElse(null), revision + 1, cutoff, zone);
            var statement = new SettlementStatement(UUID.randomUUID(), organization, type, scopeId, scope.eventId(),
                    number, revision + 1, current.map(SettlementStatement::id).orElse(null),
                    current.map(SettlementStatement::number).orElse(null), null, SettlementStatement.CURRENT,
                    zone.getId(), cutoff, cutoff, actor,
                    new OrganizationDetails(profile.displayName(), profile.legalName(), profile.taxCode(),
                            profile.billingAddress(), profile.contactEmail(), profile.contactPhone(),
                            profile.website(), logoBytes != null),
                    new ScopeDetails(scope.title(), scope.eventTitle(), scope.venueName(), scope.startsAt(),
                            scope.endsAt(), scope.performances()),
                    figures.totals(), figures.lines(), false);
            byte[] pdf = renderer.pdf(statement, logoBytes);
            current.ifPresent(previous -> store.supersede(previous.id()));
            store.insert(statement, pdf, sha256(pdf));
            return statement;
        }));
        return new IssueResult(issued, logoOmitted);
    }

    private static void requireFinal(ScopeState scope) {
        if (!scope.allFinal()) {
            throw new AppException(ErrorCode.STATEMENT_NOT_FINAL,
                    scope.refundsPending() ? "error.statement.refunds-pending" : "error.statement.not-ended");
        }
    }

    private static ZoneId zoneOf(String value) {
        try {
            return value == null ? ZoneId.of("Asia/Ho_Chi_Minh") : ZoneId.of(value);
        } catch (DateTimeException invalid) {
            return ZoneId.of("Asia/Ho_Chi_Minh");
        }
    }

    /** TBS-yyyy-nnnnnn for revision 1, then the same base with -R2, -R3 and so on. */
    private String number(SettlementStatement previous, int revision, OffsetDateTime at, ZoneId zone) {
        if (previous == null) {
            return String.format(Locale.ROOT, "TBS-%d-%06d", at.atZoneSameInstant(zone).getYear(), store.nextSequence());
        }
        return previous.number().replaceAll("-R\\d+$", "") + "-R" + revision;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Unknown id, or an id of another organization. */
    static class StatementNotFound extends AppException {
        StatementNotFound() {
            super(ErrorCode.RESOURCE_NOT_FOUND, "error.resource-not-found");
        }
    }
}
