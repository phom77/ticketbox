package org.ticketbox.split;

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

import static org.assertj.core.api.Assertions.*;

@Testcontainers
class ProjectionReceiverIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    static final ObjectMapper json = new ObjectMapper();
    static JdbcTemplate ticketing;
    static JdbcTemplate checkin;
    static TransactionTemplate ticketingTransaction;
    static TransactionTemplate checkinTransaction;

    @BeforeAll
    static void migrate() {
        ticketing = database("ticketing");
        checkin = database("checkin");
        ticketingTransaction = new TransactionTemplate(new DataSourceTransactionManager(ticketing.getDataSource()));
        checkinTransaction = new TransactionTemplate(new DataSourceTransactionManager(checkin.getDataSource()));
    }

    static JdbcTemplate database(String service) {
        var admin = new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
        admin.execute("CREATE DATABASE " + service);
        String url = postgres.getJdbcUrl().replace("/test", "/" + service);
        Flyway.configure().dataSource(url, postgres.getUsername(), postgres.getPassword())
                .locations("filesystem:../" + service + "/src/main/resources/db/migration").load().migrate();
        return new JdbcTemplate(new DriverManagerDataSource(url, postgres.getUsername(), postgres.getPassword()));
    }

    ObjectNode catalog(UUID id, long version, String title) {
        String payload = ticketing.queryForObject("""
                SELECT jsonb_build_object('id',c.id,'version',1,'deleted',false,'concert',to_jsonb(c),
                'types',(SELECT jsonb_agg(to_jsonb(t)) FROM ticket_types t WHERE t.concert_id=c.id))::text
                FROM concerts c WHERE id=?
                """,String.class,id);
        try {
            var result=(ObjectNode)json.readTree(payload);
            result.put("version",version);
            ((ObjectNode)result.get("concert")).put("title",title);
            return result;
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }

    @Test
    void lateAndConcurrentConfigurationsCannotRegressAppliedVersion() throws Exception {
        UUID id=ticketing.queryForObject("SELECT id FROM concerts ORDER BY id LIMIT 1",UUID.class);
        var receiver=new ProjectionReceiver(ticketing,true);
        var newer=catalog(id,12,"Version twelve");
        var older=catalog(id,11,"Version eleven");
        try (var workers=Executors.newFixedThreadPool(2)) {
            var first=workers.submit(()->ticketingTransaction.executeWithoutResult(tx->receiver.catalog(newer)));
            var second=workers.submit(()->ticketingTransaction.executeWithoutResult(tx->receiver.catalog(older)));
            first.get();second.get();
        }
        assertThat(ticketing.queryForObject("SELECT title FROM concerts WHERE id=?",String.class,id)).isEqualTo("Version twelve");
        assertThat(ticketing.queryForObject("SELECT version FROM projection_versions WHERE kind='catalog' AND id=?",Long.class,id)).isEqualTo(12);
    }

    @Test
    void failedInventoryResizeRollsBackMetadataAndVersionTogether() {
        UUID type=ticketing.queryForObject("SELECT ticket_type_id FROM ticket_inventory ORDER BY ticket_type_id DESC LIMIT 1",UUID.class);
        UUID id=ticketing.queryForObject("SELECT concert_id FROM ticket_types WHERE id=?",UUID.class,type);
        String previous=ticketing.queryForObject("SELECT title FROM concerts WHERE id=?",String.class,id);
        ticketing.update("UPDATE ticket_inventory SET available_qty=total_quantity-1 WHERE ticket_type_id=?",type);
        var envelope=catalog(id,100,"Must roll back");
        for(var node:envelope.withArray("types")) {
            if(node.get("id").asText().equals(type.toString())) {
                ((ObjectNode)node).put("total_quantity",node.get("total_quantity").asInt()+1);
            }
        }
        var receiver=new ProjectionReceiver(ticketing,true);
        assertThatThrownBy(()->ticketingTransaction.executeWithoutResult(tx->receiver.catalog(envelope)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(ticketing.queryForObject("SELECT title FROM concerts WHERE id=?",String.class,id)).isEqualTo(previous);
        assertThat(ticketing.queryForObject("SELECT count(*) FROM projection_versions WHERE kind='catalog' AND id=?",Long.class,id)).isZero();
    }

    @Test
    void reissuedSnapshotCannotEraseLocalAdmission() throws Exception {
        UUID id=checkin.queryForObject("SELECT id FROM tickets WHERE status='VALID' ORDER BY id LIMIT 1",UUID.class);
        String snapshot=checkin.queryForObject("""
                SELECT jsonb_build_object('id',id,'version',2,'ticket',to_jsonb(t))::text FROM tickets t WHERE id=?
                """,String.class,id);
        var event=json.readTree(snapshot);
        checkin.update("UPDATE tickets SET status='USED',used_at=now() WHERE id=?",id);
        checkin.update("""
                INSERT INTO checkin_logs(id,ticket_id,concert_id,staff_id,device_id,checked_at,is_offline,created_at,updated_at)
                SELECT gen_random_uuid(),id,concert_id,gen_random_uuid(),'test-device',now(),false,now(),now() FROM tickets WHERE id=?
                """,id);
        var receiver=new ProjectionReceiver(checkin,false);
        checkinTransaction.executeWithoutResult(tx->receiver.ticket(event));
        assertThat(checkin.queryForObject("SELECT status FROM tickets WHERE id=?",String.class,id)).isEqualTo("USED");
        assertThat(checkin.queryForObject("SELECT count(*) FROM checkin_logs WHERE ticket_id=?",Integer.class,id)).isEqualTo(1);
    }
}
