package org.ticketbox.ticketing.reporting.application.port;

import org.ticketbox.ticketing.reporting.domain.SettlementStatement;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.Line;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.Totals;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Read model over the sales ledger and payment reconciliation, and storage of issued statements (ADR 0007). */
public interface StatementStore {
    /** A performance or an event of the organization with its finality state. {@code ownZone} may be null. */
    record ScopeState(String type, UUID scopeId, UUID eventId, String title, String eventTitle, String venueName,
                      OffsetDateTime startsAt, OffsetDateTime endsAt, ZoneId ownZone, int performances,
                      boolean allFinal, boolean refundsPending) {}

    /** {@code fingerprint} identifies the ledger and verified reconciliation rows the figures were built from. */
    record Figures(Totals totals, List<Line> lines, String fingerprint) {}

    /** Empty when the scope does not belong to the organization or has no non-draft performance. */
    Optional<ScopeState> scope(UUID organization, String type, UUID scopeId);

    /** Non-draft performances of the organization, plus events with more than one of them. */
    List<ScopeState> candidates(UUID organization, String search);

    /**
     * All figures of the scope as of one database snapshot (one statement), with the fingerprint of the rows they
     * were built from. Nothing is filtered by time: a row that commits later changes the fingerprint.
     */
    Figures figures(UUID organization, ScopeState scope);

    /** All-time net sales and tickets per scope in one batch, keyed "type:scopeId" with {net, tickets}. */
    Map<String, long[]> netToDate(UUID organization, Collection<ScopeState> scopes);

    /** Ids of the statements whose scope's current fingerprint differs from the one stored at issue. */
    Set<UUID> outOfDate(Collection<SettlementStatement> statements);

    void lock(UUID organization, String type, UUID scopeId);

    OffsetDateTime now();

    Optional<SettlementStatement> current(UUID organization, String type, UUID scopeId);

    /** Headers of every current statement of the organization, without lines. */
    List<SettlementStatement> currentStatements(UUID organization);

    /** With lines. */
    Optional<SettlementStatement> find(UUID organization, UUID id);

    Optional<byte[]> pdf(UUID organization, UUID id);

    /** Next global statement sequence value. */
    long nextSequence();

    void supersede(UUID statementId);

    void insert(SettlementStatement statement, byte[] pdf, String pdfSha256, String fingerprint);

    /** Headers newest first, optionally of one event, fetching one extra row to tell whether more exist. */
    List<SettlementStatement> list(UUID organization, UUID eventId, int offset, int limit);
}
