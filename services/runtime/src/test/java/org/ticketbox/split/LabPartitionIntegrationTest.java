package org.ticketbox.split;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.*;

@Testcontainers
class LabPartitionIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test void hashMigrationPreservesEventsReplayChecksAndAppendOnlyPermissions() {
        var jdbc = database("ticketing");
        jdbc.execute("CREATE ROLE ticketing_runtime LOGIN PASSWORD 'runtime-test'");
        jdbc.execute("ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ticketing_runtime");
        migrate("ticketing", false);
        var events = jdbc.queryForList("SELECT * FROM order_events ORDER BY order_id,stream_version");
        var replay = jdbc.queryForList("SELECT id,replay_order(id) AS snapshot FROM orders ORDER BY id");
        migrate("ticketing", true);
        assertThat(jdbc.queryForObject("SELECT relkind::text FROM pg_class WHERE oid='order_events'::regclass", String.class)).isEqualTo("p");
        assertThat(jdbc.queryForList("SELECT * FROM order_events ORDER BY order_id,stream_version")).isEqualTo(events);
        assertThat(jdbc.queryForList("SELECT id,replay_order(id) AS snapshot FROM orders ORDER BY id")).isEqualTo(replay);
        assertThatThrownBy(() -> jdbc.execute("INSERT INTO order_events SELECT * FROM order_events LIMIT 1")).hasMessageContaining("duplicate key");
        for (String values : new String[]{"0,'OrderPaid',1,'{}'", "1,'OrderPaid',1,'{}'", "1,'OrderCreated',2,'{}'", "1,'OrderCreated',1,'[]'"}) {
            assertThatThrownBy(() -> jdbc.execute("INSERT INTO order_events(order_id,stream_version,event_type,schema_version,payload) VALUES(gen_random_uuid()," + values + ")"))
                    .hasMessageContaining("check constraint");
        }
        var runtime = new JdbcTemplate(new DriverManagerDataSource(url("ticketing"),"ticketing_runtime","runtime-test"));
        {
            runtime.execute("INSERT INTO order_events(order_id,stream_version,event_type,payload) VALUES(gen_random_uuid(),1,'OrderCreated','{}')");
            assertThatThrownBy(() -> runtime.execute("UPDATE order_events SET payload='{}' WHERE false")).rootCause().hasMessageContaining("permission denied");
            assertThatThrownBy(() -> runtime.execute("DELETE FROM order_events_h0 WHERE false")).rootCause().hasMessageContaining("permission denied");
            assertThatThrownBy(() -> runtime.execute("TRUNCATE order_events")).rootCause().hasMessageContaining("permission denied");
        }
    }

    @Test void monthlyAuditPreservesRowsBoundaryFallbackAndAdmissionUniqueness() {
        var jdbc = database("checkin");
        jdbc.execute("CREATE ROLE checkin_runtime LOGIN PASSWORD 'runtime-test'");
        jdbc.execute("ALTER DEFAULT PRIVILEGES GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO checkin_runtime");
        migrate("checkin", false);
        jdbc.execute("INSERT INTO checkin_logs(id,ticket_id,concert_id,staff_id,device_id,checked_at,is_offline,created_at,updated_at) SELECT gen_random_uuid(),id,concert_id,gen_random_uuid(),'before-migration',now(),false,now(),now() FROM tickets WHERE status='VALID' LIMIT 1");
        Flyway.configure().dataSource(url("checkin"),postgres.getUsername(),postgres.getPassword())
                .locations("filesystem:../checkin/src/main/resources/db/migration","filesystem:../checkin/src/main/resources/db/lab")
                .target("99").load().migrate();
        var before = jdbc.queryForList("SELECT * FROM scan_audit ORDER BY recorded_at,id");
        assertThat(before).hasSize(1);
        migrate("checkin", true);
        assertThat(jdbc.queryForObject("SELECT relkind::text FROM pg_class WHERE oid='scan_audit'::regclass", String.class)).isEqualTo("p");
        assertThat(jdbc.queryForList("SELECT * FROM scan_audit ORDER BY recorded_at,id")).isEqualTo(before);
        jdbc.execute("INSERT INTO scan_audit(id,recorded_at,ticket_id,concert_id,staff_id,device_id,is_offline) VALUES ('11111111-1111-1111-1111-111111111111','2000-01-01T00:00:00Z',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'old',false)");
        assertThat(jdbc.queryForObject("SELECT tableoid::regclass::text FROM scan_audit WHERE device_id='old'", String.class)).isEqualTo("scan_audit_default");
        assertThatThrownBy(() -> jdbc.execute("INSERT INTO scan_audit SELECT * FROM scan_audit WHERE device_id='old'"))
                .hasMessageContaining("duplicate key");
        jdbc.execute("INSERT INTO checkin_logs(id,ticket_id,concert_id,staff_id,device_id,checked_at,is_offline,created_at,updated_at) SELECT gen_random_uuid(),id,concert_id,gen_random_uuid(),'audit-test',now(),false,now(),now() FROM tickets t WHERE status='VALID' AND NOT EXISTS(SELECT FROM checkin_logs l WHERE l.ticket_id=t.id) LIMIT 1");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scan_audit WHERE device_id='audit-test'", Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> jdbc.execute("INSERT INTO checkin_logs SELECT gen_random_uuid(),ticket_id,concert_id,staff_id,device_id,checked_at,sync_at,is_offline,gate,notes,created_at,updated_at FROM checkin_logs WHERE device_id='audit-test'"))
                .hasMessageContaining("duplicate key");
        jdbc.execute("SELECT ensure_scan_audit_month('2000-01-01')");
        assertThat(jdbc.queryForObject("SELECT tableoid::regclass::text FROM scan_audit WHERE device_id='old'",String.class)).isEqualTo("scan_audit_2000_01");
        jdbc.execute("SELECT ensure_scan_audit_month('2000-02-15')");
        jdbc.execute("INSERT INTO scan_audit(recorded_at,ticket_id,concert_id,device_id,is_offline) VALUES('2000-02-01T07:00:00+07',gen_random_uuid(),gen_random_uuid(),'utc-boundary',true)");
        assertThat(jdbc.queryForObject("SELECT tableoid::regclass::text FROM scan_audit WHERE device_id='utc-boundary'",String.class)).isEqualTo("scan_audit_2000_02");
        jdbc.execute("INSERT INTO scan_audit(recorded_at,ticket_id,concert_id,device_id,is_offline) VALUES('2000-01-31T23:59:59Z',gen_random_uuid(),gen_random_uuid(),'before-boundary',false)");
        assertThat(jdbc.queryForObject("SELECT count(DISTINCT tableoid) FROM scan_audit WHERE recorded_at>='2000-01-31T23:59:59Z' AND recorded_at<'2000-02-01T00:00:01Z'",Integer.class)).isEqualTo(2);
        long ledgerRows=jdbc.queryForObject("SELECT count(*) FROM checkin_logs",Long.class);
        jdbc.execute("ALTER TABLE scan_audit DETACH PARTITION scan_audit_2000_01");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scan_audit WHERE device_id='old'",Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scan_audit_2000_01",Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkin_logs",Long.class)).isEqualTo(ledgerRows);
        jdbc.execute("ALTER TABLE scan_audit ATTACH PARTITION scan_audit_2000_01 FOR VALUES FROM ('2000-01-01T00:00:00Z') TO ('2000-02-01T00:00:00Z')");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM scan_audit WHERE device_id='old'",Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> jdbc.execute("INSERT INTO checkin_logs(id,ticket_id,concert_id,checked_at,is_offline) SELECT gen_random_uuid(),gen_random_uuid(),id,now(),false FROM concerts LIMIT 1"))
                .hasMessageContaining("foreign key constraint");
        var runtime = new JdbcTemplate(new DriverManagerDataSource(url("checkin"),"checkin_runtime","runtime-test"));
        {
            assertThatThrownBy(() -> runtime.execute("DELETE FROM scan_audit WHERE false")).rootCause().hasMessageContaining("permission denied");
            assertThatThrownBy(() -> runtime.execute("DELETE FROM scan_audit_default WHERE false")).rootCause().hasMessageContaining("permission denied");
        }
    }

    JdbcTemplate database(String name) {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        jdbc.execute("CREATE DATABASE " + name);
        return new JdbcTemplate(new DriverManagerDataSource(url(name), postgres.getUsername(), postgres.getPassword()));
    }
    String url(String name) { return postgres.getJdbcUrl().replace("/test", "/" + name); }
    void migrate(String name, boolean lab) {
        String base = "filesystem:../" + name + "/src/main/resources/db/";
        var config = Flyway.configure().dataSource(url(name), postgres.getUsername(), postgres.getPassword());
        config.locations(lab ? new String[]{base + "migration", base + "lab"} : new String[]{base + "migration"}).load().migrate();
    }
}
