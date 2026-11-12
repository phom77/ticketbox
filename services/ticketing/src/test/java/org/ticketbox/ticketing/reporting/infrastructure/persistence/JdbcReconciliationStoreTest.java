package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.reporting.application.ReconciliationService;
import org.ticketbox.ticketing.reporting.application.ReconciliationService.DateBasis;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Snapshot;

@Testcontainers
class JdbcReconciliationStoreTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void reportsStableScopedSnapshotsAndExactLocalDates() throws Exception {
        var datasource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(datasource).load().migrate();
        var jdbc = new NamedParameterJdbcTemplate(datasource);
        var sql = jdbc.getJdbcTemplate();
        var reconciliation = new ReconciliationService(new JdbcReconciliationStore(jdbc));
        UUID organization = UUID.randomUUID();
        UUID concert = sql.queryForObject("SELECT id FROM concerts ORDER BY id LIMIT 1", UUID.class);
        UUID buyer = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        UUID intent = UUID.randomUUID();
        OffsetDateTime start = OffsetDateTime.parse("2026-11-11T17:00:00Z");
        sql.update("UPDATE concerts SET organization_id=?,title='=Concert' WHERE id=?", organization, concert);
        sql.update("""
                INSERT INTO orders(id,user_id,concert_id,status,total_amount,idempotency_key)
                VALUES (?,?,?,'EXPIRED',100,?)
                """, order, buyer, concert, order.toString());
        sql.update("""
                INSERT INTO ticketing_payment_intents(order_id,intent_id,user_id,provider,amount,currency,request_id,expires_at,created_at)
                VALUES (?,?,?,'VNPAY',100,'VND',?,?,?)
                """, order, intent, buyer, intent.toString(), start.plusMinutes(15), start);
        sql.update("UPDATE concerts SET organization_id=? WHERE id=?", UUID.randomUUID(), concert);

        var latest = new Snapshot(1, intent, order, 3, "VNPAY", "RECONCILIATION_REQUIRED",
                100, "tx", 100L, start, start, 100L, "+refund", start);
        var earlier = new Snapshot(1, intent, order, 2, "VNPAY", "FAILED",
                100, null, null, start, null, null, null, start);
        var unmatched = new Snapshot(1, UUID.randomUUID(), UUID.randomUUID(), 1, "VNPAY", "UNKNOWN",
                100, null, null, start, null, null, null, start);
        reconciliation.receive(latest);
        reconciliation.receive(earlier);
        reconciliation.receive(latest);
        reconciliation.receive(unmatched);

        LocalDate day = LocalDate.of(2026, 11, 12);
        var filter = reconciliation.filter(organization, false, concert, day, day.plusDays(1), DateBasis.ATTEMPT);
        var report = reconciliation.report(filter, 0, 1);
        assertThat(report.content()).singleElement().satisfies(row -> {
            assertThat(row.organizationId()).isEqualTo(organization);
            assertThat(row.paymentState()).isEqualTo("RECONCILIATION_REQUIRED");
            assertThat(row.refundReference()).isEqualTo("+refund");
        });
        assertThat(report.totals().paidOrderSales()).isZero();
        assertThat(report.totals().verifiedCollections()).isEqualTo(100);
        assertThat(reconciliation.report(filter, 1, 1).content()).isEmpty();
        var previousDay = reconciliation.filter(organization, false, concert, day.minusDays(1), day, DateBasis.COLLECTION);
        assertThat(reconciliation.report(previousDay, 0, 1).content()).isEmpty();
        var exceptions = reconciliation.filter(null, true, null, day, day.plusDays(1), DateBasis.ATTEMPT);
        assertThat(reconciliation.report(exceptions, 0, 1).content()).singleElement()
                .satisfies(row -> assertThat(row.intentId()).isEqualTo(unmatched.intentId()));

        var stream = new ByteArrayOutputStream();
        reconciliation.writeCsv(filter, stream);
        assertThat(stream.toString(StandardCharsets.UTF_8)).contains("\"'=Concert\"", "\"'+refund\"", order.toString());
    }
}
