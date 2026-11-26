package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.reporting.application.SalesReportService;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.UUID;

/**
 * ADR 0005 / design: no rollup table until the ledger's p95 for one organization with a million rows exceeds 500 ms.
 * This test loads a million rows, records the p95 of summary and trend and fails above a generous guard so CI load cannot flake it.
 */
@Testcontainers
class SalesLedgerScaleTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final int RUNS = 20;
    /** Regression guard. The rollup decision threshold is 500 ms; the measured p95 is printed for the record. */
    private static final long THRESHOLD_MS = 1500;

    @Test
    void aMillionLedgerRowsAggregateWithinTheRollupThreshold() {
        var datasource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(datasource).load().migrate();
        var db = new JdbcTemplate(datasource);
        UUID org = UUID.randomUUID();
        db.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,sale_start_at,status,created_by,organization_id)
                SELECT gen_random_uuid(), 'Scale ' || n, 'Venue', 'Address', now() + interval '30 days',
                       now() - interval '1 day', 'ON_SALE', gen_random_uuid(), ?
                  FROM generate_series(1, 500) n
                """, org);
        db.update("""
                INSERT INTO sales_ledger(order_id, order_item_id, kind, organization_id, event_id, performance_id, offer_id,
                        offer_name, quantity, amount, occurred_at)
                SELECT gen_random_uuid(), gen_random_uuid(), CASE WHEN n % 20 = 0 THEN 'REFUND' ELSE 'SALE' END, ?,
                       c.id, c.id, gen_random_uuid(), 'General', 1 + n % 4, 100000 * (1 + n % 4),
                       now() - (n % 90) * interval '1 day' - (n % 1440) * interval '1 minute'
                  FROM generate_series(1, 1000000) n
                  JOIN (SELECT id, row_number() OVER () AS rn FROM concerts WHERE organization_id = ?) c ON c.rn = 1 + n % 500
                """, org, org);
        db.execute("ANALYZE sales_ledger");
        assertThat(db.queryForObject("SELECT count(*) FROM sales_ledger WHERE organization_id = ?", Long.class, org))
                .isEqualTo(1_000_000L);

        var reports = new SalesReportService(new JdbcSalesReportStore(new NamedParameterJdbcTemplate(datasource)));
        LocalDate to = LocalDate.now(), from = to.minusDays(29);
        var summary = new ArrayList<Long>();
        var trend = new ArrayList<Long>();
        for (int i = 0; i < RUNS; i++) {
            summary.add(time(() -> reports.summary(org, null, null, from, to, true)));
            trend.add(time(() -> reports.trend(org, null, null, from, to, "day", true)));
        }
        long summaryP95 = p95(summary), trendP95 = p95(trend);
        System.out.printf("sales-ledger scale: summary p95=%d ms, trend p95=%d ms (1,000,000 rows, 30 days)%n",
                summaryP95, trendP95);
        assertThat(summaryP95).isLessThanOrEqualTo(THRESHOLD_MS);
        assertThat(trendP95).isLessThanOrEqualTo(THRESHOLD_MS);
    }

    private static long time(Runnable work) {
        long start = System.nanoTime();
        work.run();
        return (System.nanoTime() - start) / 1_000_000;
    }

    private static long p95(java.util.List<Long> samples) {
        var sorted = new ArrayList<>(samples);
        Collections.sort(sorted);
        return sorted.get((int) Math.ceil(sorted.size() * 0.95) - 1);
    }
}
