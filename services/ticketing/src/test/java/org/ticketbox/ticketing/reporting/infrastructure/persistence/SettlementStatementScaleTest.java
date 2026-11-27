package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement;

import java.time.OffsetDateTime;
import java.util.UUID;

/** ADR 0007 risk: figures for one event with 100,000 ledger rows. Records the time; fails only above a generous guard. */
@Testcontainers
class SettlementStatementScaleTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final long THRESHOLD_MS = 5000;

    @Test
    void figuresForAHundredThousandLedgerRowsOfOneEventStayWithinTheGuard() {
        var datasource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(datasource).load().migrate();
        var db = new JdbcTemplate(datasource);
        UUID org = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        db.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,sale_start_at,status,created_by,organization_id)
                SELECT gen_random_uuid(), 'Scale ' || n, 'Venue', 'Address', now() - interval '30 days',
                       now() - interval '60 days', 'COMPLETED', gen_random_uuid(), ?
                  FROM generate_series(1, 20) n
                """, org);
        db.update("""
                INSERT INTO performance_sales(id,event_id,source_version,ends_at,timezone,max_per_account,source_payload)
                SELECT id, ?, 1, now() - interval '29 days', 'Asia/Ho_Chi_Minh', 4, '{}'::jsonb FROM concerts WHERE organization_id = ?
                """, event, org);
        db.update("""
                INSERT INTO sales_ledger(order_id, order_item_id, kind, organization_id, event_id, performance_id, offer_id,
                        offer_name, quantity, amount, provider, occurred_at)
                SELECT gen_random_uuid(), gen_random_uuid(), CASE WHEN n % 20 = 0 THEN 'REFUND' ELSE 'SALE' END, ?, ?,
                       c.id, gen_random_uuid(), 'General', 1 + n % 4, 100000 * (1 + n % 4), 'MOCK', now() - interval '40 days'
                  FROM generate_series(1, 100000) n
                  JOIN (SELECT id, row_number() OVER () AS rn FROM concerts WHERE organization_id = ?) c ON c.rn = 1 + n % 20
                """, org, event, org);
        db.update("""
                INSERT INTO payment_reconciliation(intent_id, order_id, revision, provider, state, requested_amount,
                        transaction_id, collected_amount, attempted_at, verified_at, changed_at)
                SELECT gen_random_uuid(), order_id, 1, 'MOCK', 'PAID', amount, 'tx', amount, now(), now(), now()
                  FROM sales_ledger WHERE organization_id = ? AND kind = 'SALE' AND quantity = 1
                """, org);
        db.execute("ANALYZE");

        var store = new JdbcStatementStore(new NamedParameterJdbcTemplate(datasource), new ObjectMapper().findAndRegisterModules());
        var scope = store.scope(org, SettlementStatement.EVENT, event).orElseThrow();
        assertThat(scope.allFinal()).isTrue();
        long start = System.nanoTime();
        var figures = store.figures(org, scope, OffsetDateTime.now());
        long millis = (System.nanoTime() - start) / 1_000_000;
        System.out.printf("settlement statement scale: figures for 100,000 ledger rows of one event took %d ms%n", millis);
        assertThat(figures.totals().saleOrders() + figures.totals().refundOrders()).isEqualTo(100000);
        assertThat(figures.lines().stream().filter(l -> l.kind().equals("PERFORMANCE"))).hasSize(20);
        assertThat(millis).isLessThanOrEqualTo(THRESHOLD_MS);
    }
}
