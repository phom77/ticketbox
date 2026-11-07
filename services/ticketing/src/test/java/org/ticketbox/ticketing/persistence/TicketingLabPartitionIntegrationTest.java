package org.ticketbox.ticketing.persistence;

import static org.assertj.core.api.Assertions.*;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class TicketingLabPartitionIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void hashMigrationPreservesEventsReplayChecksAndAppendOnlyPermissions() {
        var jdbc = database("ticketing");
        jdbc.execute("CREATE ROLE ticketing_runtime LOGIN PASSWORD 'runtime-test'");
        jdbc.execute(
                "ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO"
                        + " ticketing_runtime");
        migrate("ticketing", false);
        var events =
                jdbc.queryForList("SELECT * FROM order_events ORDER BY order_id,stream_version");
        var replay =
                jdbc.queryForList("SELECT id,replay_order(id) AS snapshot FROM orders ORDER BY id");
        migrate("ticketing", true);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT relkind::text FROM pg_class WHERE"
                                        + " oid='order_events'::regclass",
                                String.class))
                .isEqualTo("p");
        assertThat(jdbc.queryForList("SELECT * FROM order_events ORDER BY order_id,stream_version"))
                .isEqualTo(events);
        assertThat(
                        jdbc.queryForList(
                                "SELECT id,replay_order(id) AS snapshot FROM orders ORDER BY id"))
                .isEqualTo(replay);
        assertThatThrownBy(
                        () ->
                                jdbc.execute(
                                        "INSERT INTO order_events SELECT * FROM order_events LIMIT"
                                                + " 1"))
                .hasMessageContaining("duplicate key");
        for (String values :
                new String[] {
                    "0,'OrderPaid',1,'{}'",
                    "1,'OrderPaid',1,'{}'",
                    "1,'OrderCreated',2,'{}'",
                    "1,'OrderCreated',1,'[]'"
                }) {
            assertThatThrownBy(
                            () ->
                                    jdbc.execute(
                                            "INSERT INTO"
                                                + " order_events(order_id,stream_version,event_type,schema_version,payload)"
                                                + " VALUES(gen_random_uuid(),"
                                                    + values
                                                    + ")"))
                    .hasMessageContaining("check constraint");
        }
        var runtime =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                url("ticketing"), "ticketing_runtime", "runtime-test"));
        {
            runtime.execute(
                    "INSERT INTO order_events(order_id,stream_version,event_type,payload)"
                            + " VALUES(gen_random_uuid(),1,'OrderCreated','{}')");
            assertThatThrownBy(
                            () ->
                                    runtime.execute(
                                            "UPDATE order_events SET payload='{}' WHERE false"))
                    .rootCause()
                    .hasMessageContaining("permission denied");
            assertThatThrownBy(() -> runtime.execute("DELETE FROM order_events_h0 WHERE false"))
                    .rootCause()
                    .hasMessageContaining("permission denied");
            assertThatThrownBy(() -> runtime.execute("TRUNCATE order_events"))
                    .rootCause()
                    .hasMessageContaining("permission denied");
        }
    }

    JdbcTemplate database(String name) {
        var jdbc =
                new JdbcTemplate(
                        new DriverManagerDataSource(
                                postgres.getJdbcUrl(),
                                postgres.getUsername(),
                                postgres.getPassword()));
        jdbc.execute("CREATE DATABASE " + name);
        return new JdbcTemplate(
                new DriverManagerDataSource(
                        url(name), postgres.getUsername(), postgres.getPassword()));
    }

    String url(String name) {
        return postgres.getJdbcUrl().replace("/test", "/" + name);
    }

    void migrate(String name, boolean lab) {
        String base = "classpath:db/";
        var config =
                Flyway.configure()
                        .dataSource(url(name), postgres.getUsername(), postgres.getPassword());
        config.locations(
                        lab
                                ? new String[] {base + "migration", base + "lab"}
                                : new String[] {base + "migration"})
                .load()
                .migrate();
    }
}
