package org.ticketbox.ticketing.reporting.infrastructure.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;

/** ADR 0007: issued statements are insert-only for the runtime role; only a status change supersedes one. */
@Testcontainers
class SettlementStatementPermissionsTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void theRuntimeRoleCanOnlySupersedeAndASupersededStatementNeverBecomesCurrentAgain() {
        var owner = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        var admin = new JdbcTemplate(owner);
        admin.execute("CREATE ROLE ticketing_runtime LOGIN PASSWORD 'runtime-test'");
        admin.execute("ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ticketing_runtime");
        Flyway.configure().dataSource(owner).load().migrate();
        var runtime = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(), "ticketing_runtime", "runtime-test"));

        UUID org = UUID.randomUUID();
        UUID scope = UUID.randomUUID();
        UUID first = statement(admin, org, scope, 1, "SUPERSEDED", "TBS-T-1");
        UUID second = statement(admin, org, scope, 2, "CURRENT", "TBS-T-1-R2");
        admin.update("INSERT INTO settlement_statement_lines(statement_id,kind,sort,label,tickets_sold,tickets_refunded,"
                + "gross_sales,refunds,net_sales,verified_collected,verified_refunded,sale_orders,refund_orders)"
                + " VALUES (?,'OFFER',0,'General',0,0,0,0,0,0,0,0,0)", second);

        assertThatThrownBy(() -> runtime.update("UPDATE settlement_statements SET gross_sales = 1 WHERE id = ?", second))
                .rootCause().hasMessageContaining("permission denied");
        assertThatThrownBy(() -> runtime.update("UPDATE settlement_statements SET number = 'x' WHERE id = ?", second))
                .rootCause().hasMessageContaining("permission denied");
        assertThatThrownBy(() -> runtime.update("DELETE FROM settlement_statements WHERE id = ?", second))
                .rootCause().hasMessageContaining("permission denied");
        assertThatThrownBy(() -> runtime.update("UPDATE settlement_statement_lines SET label = 'x'"))
                .rootCause().hasMessageContaining("permission denied");
        assertThatThrownBy(() -> runtime.update("DELETE FROM settlement_statement_lines"))
                .rootCause().hasMessageContaining("permission denied");

        assertThat(runtime.update("UPDATE settlement_statements SET status = 'SUPERSEDED' WHERE id = ?", second)).isEqualTo(1);
        assertThatThrownBy(() -> runtime.update("UPDATE settlement_statements SET status = 'CURRENT' WHERE id = ?", first))
                .rootCause().hasMessageContaining("superseded");
        assertThatThrownBy(() -> admin.update("UPDATE settlement_statements SET status = 'CURRENT' WHERE id = ?", second))
                .rootCause().hasMessageContaining("superseded");
        assertThat(admin.queryForObject("SELECT count(*) FROM settlement_statements WHERE status = 'CURRENT'", Integer.class))
                .isZero();
    }

    private static UUID statement(JdbcTemplate db, UUID org, UUID scope, int revision, String status, String number) {
        UUID id = UUID.randomUUID();
        db.update("""
                INSERT INTO settlement_statements (id, organization_id, scope_type, scope_id, event_id, number, revision,
                    status, timezone, cutoff_at, fingerprint, issued_at, issued_by, organization_snapshot, scope_snapshot,
                    gross_sales, refunds, net_sales, sale_orders, refund_orders, tickets_sold, tickets_refunded,
                    verified_collected, verified_refunded, unreconciled_orders, pdf, pdf_sha256)
                VALUES (?, ?, 'PERFORMANCE', ?, ?, ?, ?, ?, 'UTC', now(), '0:0:0:0', now(), ?, '{}', '{}',
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, decode('00', 'hex'), 'x')
                """, id, org, scope, scope, number, revision, status, UUID.randomUUID());
        return id;
    }
}
