package org.ticketbox.ticketing.reporting.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

public interface ReconciliationStore {
    record Snapshot(int schemaVersion, UUID intentId, UUID orderId, long revision,
                    String provider, String state, long requestedAmount, String transactionId,
                    Long collectedAmount, OffsetDateTime attemptedAt, OffsetDateTime verifiedAt,
                    Long refundAmount, String refundReference, OffsetDateTime changedAt) {}

    record Filter(UUID organizationId, boolean unattributed, UUID concertId,
                  OffsetDateTime from, OffsetDateTime to, boolean byCollection) {}

    record Row(UUID intentId, UUID orderId, UUID organizationId, UUID concertId, String concertTitle,
               String provider, String paymentState, String orderStatus, long requestedAmount,
               String transactionId, Long collectedAmount, OffsetDateTime attemptedAt,
               OffsetDateTime verifiedAt, Long refundAmount, String refundReference,
               OffsetDateTime changedAt, OffsetDateTime receivedAt, String referenceCode) {}

    record Totals(long transactions, long paidOrderSales, long verifiedCollections,
                  long missingSnapshots, OffsetDateTime latestSnapshot) {}

    void apply(Snapshot snapshot);

    Totals totals(Filter filter);

    /** Keyset position: the basis time and intent id of the last row of the previous page. */
    record Cursor(OffsetDateTime at, UUID intentId) {}

    /** Pages by {@code after} when given (stable under inserts), otherwise by offset. */
    List<Row> page(Filter filter, long offset, int limit, Cursor after);

    void scan(Filter filter, Consumer<Row> consumer);
}
