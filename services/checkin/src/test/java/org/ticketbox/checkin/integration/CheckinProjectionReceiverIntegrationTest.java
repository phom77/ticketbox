package org.ticketbox.checkin.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.UUID;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class CheckinProjectionReceiverIntegrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static CheckinProjectionReceiver receiver;

    @BeforeAll
    static void migrate() {
        var dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        receiver = new CheckinProjectionReceiver(jdbc);
    }

    @Test
    void reissuedSnapshotCannotEraseLocalAdmissionAndTerminalStatusesWin() throws Exception {
        UUID id = jdbc.queryForObject("SELECT id FROM tickets WHERE status='VALID' ORDER BY id LIMIT 1", UUID.class);
        var event = (ObjectNode) JSON.readTree(jdbc.queryForObject("""
                SELECT jsonb_build_object('id',id,'version',2,'ticket',to_jsonb(t))::text FROM tickets t WHERE id=?
                """, String.class, id));
        jdbc.update("UPDATE tickets SET status='USED',used_at=now() WHERE id=?", id);
        var usedAt = jdbc.queryForObject("SELECT used_at::text FROM tickets WHERE id=?", String.class, id);
        jdbc.update("""
                INSERT INTO checkin_logs(id,ticket_id,concert_id,staff_id,device_id,checked_at,is_offline,created_at,updated_at)
                SELECT gen_random_uuid(),id,concert_id,gen_random_uuid(),'test-device',now(),false,now(),now() FROM tickets WHERE id=?
                """, id);

        transaction.executeWithoutResult(tx -> receiver.ticket(event));
        assertThat(ticketStatus(id)).isEqualTo("USED");
        assertThat(jdbc.queryForObject("SELECT used_at::text FROM tickets WHERE id=?", String.class, id)).isEqualTo(usedAt);

        ObjectNode ticket = (ObjectNode) event.get("ticket");
        event.put("version", 3);
        ticket.put("status", "CANCELLED");
        transaction.executeWithoutResult(tx -> receiver.ticket(event));
        assertThat(ticketStatus(id)).isEqualTo("CANCELLED");

        event.put("version", 4);
        ticket.put("status", "TRANSFERRED");
        transaction.executeWithoutResult(tx -> receiver.ticket(event));
        event.put("version", 3);
        ticket.put("status", "VALID");
        transaction.executeWithoutResult(tx -> receiver.ticket(event));
        assertThat(ticketStatus(id)).isEqualTo("TRANSFERRED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkin_logs WHERE ticket_id=?", Long.class, id)).isEqualTo(1);
    }

    @Test
    void catalogVersionsDoNotRegressAndAnInvalidTypeRollsBackTheWholeSnapshot() throws Exception {
        UUID id = jdbc.queryForObject("SELECT concert_id FROM ticket_types ORDER BY id LIMIT 1", UUID.class);
        var first = (ObjectNode) JSON.readTree(jdbc.queryForObject("""
                SELECT jsonb_build_object('id',c.id,'version',11,'deleted',false,'concert',to_jsonb(c),
                    'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM ticket_types t WHERE t.concert_id=c.id))::text
                FROM concerts c WHERE c.id=?
                """, String.class, id));
        var newest = first.deepCopy().put("version", 12);
        ((ObjectNode) newest.get("concert")).put("title", "Version twelve");
        try (var workers = Executors.newFixedThreadPool(2)) {
            var one = workers.submit(() -> transaction.executeWithoutResult(tx -> receiver.catalog(newest)));
            var two = workers.submit(() -> transaction.executeWithoutResult(tx -> receiver.catalog(first)));
            one.get();
            two.get();
        }
        assertThat(title(id)).isEqualTo("Version twelve");

        var invalid = newest.deepCopy().put("version", 13);
        ((ObjectNode) invalid.get("concert")).put("title", "Must roll back");
        ((ObjectNode) invalid.get("types").get(0)).putNull("price");
        assertThatThrownBy(() -> transaction.executeWithoutResult(tx -> receiver.catalog(invalid)))
                .isInstanceOf(RuntimeException.class);
        assertThat(title(id)).isEqualTo("Version twelve");
        assertThat(jdbc.queryForObject("""
                SELECT version FROM projection_versions WHERE kind='catalog' AND id=?
                """, Long.class, id)).isEqualTo(12);
    }

    private String ticketStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM tickets WHERE id=?", String.class, id);
    }

    private String title(UUID id) {
        return jdbc.queryForObject("SELECT title FROM concerts WHERE id=?", String.class, id);
    }
}
