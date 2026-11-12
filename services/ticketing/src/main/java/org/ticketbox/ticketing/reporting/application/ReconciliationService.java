package org.ticketbox.ticketing.reporting.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Filter;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Row;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Snapshot;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Totals;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class ReconciliationService {
    public enum DateBasis { ATTEMPT, COLLECTION }
    public record Report(List<Row> content, Totals totals, int page, int size) {}

    private static final ZoneId REPORTING_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Set<String> PROVIDERS = Set.of("MOCK", "VNPAY", "MOMO");
    private static final Set<String> STATES = Set.of("CREATED", "PROCESSING", "READY", "UNKNOWN", "FAILED",
            "SETTLEMENT_PENDING", "SUCCEEDED", "RECONCILIATION_REQUIRED", "REVIEW_REQUIRED");

    private final ReconciliationStore store;

    public ReconciliationService(ReconciliationStore store) {
        this.store = store;
    }

    @Transactional
    public void receive(Snapshot s) {
        if (s.schemaVersion() != 1 || s.intentId() == null || s.orderId() == null || s.revision() < 1
                || s.provider() == null || !PROVIDERS.contains(s.provider())
                || s.state() == null || !STATES.contains(s.state())
                || s.attemptedAt() == null || s.changedAt() == null || s.requestedAmount() < 0
                || (s.collectedAmount() == null) != (s.verifiedAt() == null)
                || (s.collectedAmount() != null && (s.collectedAmount() != s.requestedAmount()
                        || s.transactionId() == null || s.transactionId().isBlank()))
                || (s.refundAmount() == null) != (s.refundReference() == null)
                || (s.refundAmount() != null && (s.collectedAmount() == null || s.refundAmount() < 0
                        || s.refundAmount() > s.collectedAmount() || s.refundReference().isBlank()))) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
        }
        store.apply(s);
    }

    public Filter filter(UUID organization, boolean unattributed, UUID concert,
            LocalDate from, LocalDate to, DateBasis basis) {
        if (from == null || to == null || !from.isBefore(to) || (unattributed && organization != null)) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.reconciliation.invalid-period");
        }
        return new Filter(organization, unattributed, concert,
                from.atStartOfDay(REPORTING_ZONE).toOffsetDateTime(),
                to.atStartOfDay(REPORTING_ZONE).toOffsetDateTime(), basis == DateBasis.COLLECTION);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Report report(Filter filter, int page, int size) {
        int limit = Math.clamp(size, 1, 100);
        int index = Math.max(page, 0);
        return new Report(store.page(filter, (long) index * limit, limit),
                store.totals(filter), index, limit);
    }

    @Transactional(readOnly = true)
    public void writeCsv(Filter filter, OutputStream stream) throws IOException {
        var writer = new OutputStreamWriter(stream, StandardCharsets.UTF_8);
        writer.write("order_id,intent_id,organization_id,concert_id,concert_title,provider,payment_state,order_status,"
                + "requested_vnd,transaction_id,collected_vnd,attempted_at,verified_at,refund_vnd,refund_reference,received_at\r\n");
        store.scan(filter, row -> {
            try {
                writer.write(csv(row));
            } catch (IOException failure) {
                throw new UncheckedIOException(failure);
            }
        });
        writer.flush();
    }

    private static String csv(Row row) {
        return Stream.of(row.orderId(), row.intentId(), row.organizationId(), row.concertId(), row.concertTitle(),
                        row.provider(), row.paymentState(), row.orderStatus(), row.requestedAmount(),
                        row.transactionId(), row.collectedAmount(), row.attemptedAt(), row.verifiedAt(),
                        row.refundAmount(), row.refundReference(), row.receivedAt())
                .map(ReconciliationService::csvField).collect(Collectors.joining(",", "", "\r\n"));
    }

    private static String csvField(Object value) {
        String text = Objects.toString(value, "");
        String trimmed = text.stripLeading();
        if (value instanceof String && (!trimmed.isEmpty() && "=+-@".indexOf(trimmed.charAt(0)) >= 0
                || text.startsWith("\t") || text.startsWith("\r") || text.startsWith("\n"))) {
            text = "'" + text;
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }
}
