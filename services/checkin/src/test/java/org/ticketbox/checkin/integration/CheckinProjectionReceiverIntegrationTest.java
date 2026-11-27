package org.ticketbox.checkin.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import org.ticketbox.checkin.admission.application.port.RefundAdmission.Decision;
import org.ticketbox.checkin.admission.infrastructure.JdbcRefundAdmission;
import org.ticketbox.checkin.admission.infrastructure.LocalTickets;
import org.ticketbox.checkin.application.port.catalog.PerformanceAdmissionSnapshot;
import org.ticketbox.checkin.infrastructure.integration.CheckinProjectionReceiver;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Testcontainers
class CheckinProjectionReceiverIntegrationTest {
    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static CheckinProjectionReceiver receiver;

    @BeforeAll
    static void migrate() {
        var dataSource =
                new DriverManagerDataSource(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        jdbc = new JdbcTemplate(dataSource);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        receiver = new CheckinProjectionReceiver(jdbc, JSON);
    }

    @Test
    void reissuedSnapshotCannotEraseLocalAdmissionAndTerminalStatusesWin() throws Exception {
        UUID id =
                jdbc.queryForObject(
                        "SELECT id FROM tickets WHERE status='VALID' ORDER BY id LIMIT 1",
                        UUID.class);
        var event =
                (ObjectNode)
                        JSON.readTree(
                                jdbc.queryForObject(
                                        """
SELECT jsonb_build_object('id',id,'version',2,'ticket',to_jsonb(t))::text FROM tickets t WHERE id=?
""",
                                        String.class,
                                        id));
        jdbc.update("UPDATE tickets SET status='USED',used_at=now() WHERE id=?", id);
        var usedAt =
                jdbc.queryForObject(
                        "SELECT used_at::text FROM tickets WHERE id=?", String.class, id);
        jdbc.update(
                """
INSERT INTO checkin_logs(id,ticket_id,concert_id,staff_id,device_id,checked_at,is_offline,created_at,updated_at)
SELECT gen_random_uuid(),id,concert_id,gen_random_uuid(),'test-device',now(),false,now(),now() FROM tickets WHERE id=?
""",
                id);

        transaction.executeWithoutResult(tx -> receiver.ticket(event));
        assertThat(ticketStatus(id)).isEqualTo("USED");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT used_at::text FROM tickets WHERE id=?", String.class, id))
                .isEqualTo(usedAt);

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
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM checkin_logs WHERE ticket_id=?",
                                Long.class,
                                id))
                .isEqualTo(1);
    }

    @Test
    void refundHoldPreventsAdmissionWithoutChangingTicketStatus() {
        UUID ticket = jdbc.queryForObject("SELECT id FROM tickets WHERE status='VALID' ORDER BY id DESC LIMIT 1", UUID.class);
        UUID concert = jdbc.queryForObject("SELECT concert_id FROM tickets WHERE id=?", UUID.class, ticket);
        UUID refund = UUID.randomUUID();
        var admission = new org.ticketbox.checkin.admission.infrastructure.JdbcRefundAdmission(jdbc);
        var ids = java.util.List.of(ticket);
        var held = org.ticketbox.checkin.admission.application.port.RefundAdmission.Decision.HELD;
        var first = transaction.execute(tx -> admission.hold(refund, ids));
        var replayed = transaction.execute(tx -> admission.hold(refund, ids));
        assertThat(first).isEqualTo(held);
        assertThat(replayed).isEqualTo(held);
        var tickets = new org.ticketbox.checkin.admission.infrastructure.LocalTickets(jdbc);
        assertThat(tickets.markAsUsedIfValid(ticket, concert, java.time.OffsetDateTime.now())).isFalse();
        assertThat(ticketStatus(ticket)).isEqualTo("VALID");
        var released = org.ticketbox.checkin.admission.application.port.RefundAdmission.Decision.RELEASED;
        var release = transaction.execute(tx -> admission.release(refund));
        var stale = transaction.execute(tx -> admission.hold(refund, ids));
        assertThat(release).isEqualTo(released);
        assertThat(stale).isEqualTo(released);
    }

    @Test
    void admissionAndRefundHoldCannotBothWin() throws Exception {
        UUID ticket = jdbc.queryForObject("SELECT id FROM tickets WHERE status='VALID' ORDER BY id DESC LIMIT 1", UUID.class);
        UUID concert = jdbc.queryForObject("SELECT concert_id FROM tickets WHERE id=?", UUID.class, ticket);
        UUID refund = UUID.randomUUID();
        var admission = new JdbcRefundAdmission(jdbc);
        var tickets = new LocalTickets(jdbc);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var scan = executor.submit(() -> {
                start.await();
                return tickets.markAsUsedIfValid(ticket, concert, OffsetDateTime.now());
            });
            var hold = executor.submit(() -> {
                start.await();
                return transaction.execute(tx -> admission.hold(refund, List.of(ticket)));
            });
            start.countDown();
            boolean admitted = scan.get(10, TimeUnit.SECONDS);
            assertThat(hold.get(10, TimeUnit.SECONDS)).isEqualTo(admitted ? Decision.ALREADY_USED : Decision.HELD);
            assertThat(ticketStatus(ticket)).isEqualTo(admitted ? "USED" : "VALID");
        } finally {
            transaction.executeWithoutResult(tx -> admission.release(refund));
            jdbc.update("UPDATE tickets SET status='VALID',used_at=NULL WHERE id=?", ticket);
        }
        var missing = transaction.execute(tx -> admission.hold(UUID.randomUUID(), List.of(ticket, UUID.randomUUID())));
        assertThat(missing).isEqualTo(Decision.NOT_SYNCED);
        assertThat(jdbc.queryForObject("SELECT refund_case_id IS NULL FROM tickets WHERE id=?", Boolean.class, ticket)).isTrue();
    }

    @Test
    void postponedAdmissionStaysClosedUntilTheRevisedOpeningTime() {
        UUID ticket = jdbc.queryForObject("SELECT id FROM tickets WHERE status='VALID' ORDER BY id DESC LIMIT 1", UUID.class);
        UUID concert = jdbc.queryForObject("SELECT concert_id FROM tickets WHERE id=?", UUID.class, ticket);
        var tickets = new LocalTickets(jdbc);
        OffsetDateTime now = OffsetDateTime.now();
        transaction.executeWithoutResult(tx -> {
            jdbc.update("UPDATE concerts SET sales_suspended=true WHERE id=?", concert);
            assertThat(tickets.markAsUsedIfValid(ticket, concert, now)).isFalse();
            jdbc.update("UPDATE concerts SET sales_suspended=false,resumed_admission_at=? WHERE id=?", now.plusDays(1), concert);
            assertThat(tickets.markAsUsedIfValid(ticket, concert, now)).isFalse();
            assertThat(ticketStatus(ticket)).isEqualTo("VALID");
            jdbc.update("UPDATE concerts SET resumed_admission_at=? WHERE id=?", now.minusMinutes(1), concert);
            assertThat(tickets.markAsUsedIfValid(ticket, concert, now)).isTrue();
            tx.setRollbackOnly();
        });
    }

    @Test
    void catalogVersionsDoNotRegressAndAnInvalidTypeRollsBackTheWholeSnapshot() throws Exception {
        UUID id =
                jdbc.queryForObject(
                        "SELECT concert_id FROM ticket_types ORDER BY id LIMIT 1", UUID.class);
        var first =
                (ObjectNode)
                        JSON.readTree(
                                jdbc.queryForObject(
                                        """
SELECT jsonb_build_object('id',c.id,'version',11,'deleted',false,'concert',to_jsonb(c),
    'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM ticket_types t WHERE t.concert_id=c.id))::text
FROM concerts c WHERE c.id=?
""",
                                        String.class,
                                        id));
        var newest = first.deepCopy().put("version", 12);
        ((ObjectNode) newest.get("concert")).put("title", "Version twelve");
        try (var workers = Executors.newFixedThreadPool(2)) {
            var one =
                    workers.submit(
                            () -> transaction.executeWithoutResult(tx -> receiver.catalog(newest)));
            var two =
                    workers.submit(
                            () -> transaction.executeWithoutResult(tx -> receiver.catalog(first)));
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
        assertThat(
                        jdbc.queryForObject(
                                """
SELECT version FROM projection_versions WHERE kind='catalog' AND id=?
""",
                                Long.class,
                                id))
                .isEqualTo(12);
    }

    @Test
    void aNewerPerformanceSnapshotRenamesAnActivePerformanceAndAnOlderOneDoesNot() {
        var receiver = new CheckinProjectionReceiver(jdbc, new ObjectMapper().findAndRegisterModules());
        UUID id = UUID.randomUUID();
        UUID organization = UUID.randomUUID();
        var offer = new PerformanceAdmissionSnapshot.Offer(
                UUID.randomUUID(), "Standard", java.math.BigDecimal.valueOf(100_000), true);
        var starts = OffsetDateTime.now().plusDays(10).withNano(0);
        java.util.function.BiFunction<Long, String, PerformanceAdmissionSnapshot> snapshot =
                (version, title) ->
                        new PerformanceAdmissionSnapshot(
                                id, organization, null, version, title, "Hall", "Street", starts, null,
                                starts.minusDays(5), starts.minusHours(1), "ON_SALE", false, null, true, 4,
                                List.of(offer));

        assertThat(transaction.<Long>execute(status -> receiver.performance(snapshot.apply(1L, "First name"))))
                .isEqualTo(1L);
        assertThat(transaction.<Long>execute(status -> receiver.performance(snapshot.apply(2L, "Renamed show"))))
                .isEqualTo(2L);
        assertThat(title(id)).isEqualTo("Renamed show");
        assertThat(transaction.<Long>execute(status -> receiver.performance(snapshot.apply(1L, "First name"))))
                .isEqualTo(2L);
        assertThat(title(id)).isEqualTo("Renamed show");
    }

    @Test
    void aNewerSnapshotTogglesSalesSuspendedAndAnOlderReplayIsIgnored() {
        var receiver = new CheckinProjectionReceiver(jdbc, new ObjectMapper().findAndRegisterModules());
        UUID id = UUID.randomUUID();
        UUID organization = UUID.randomUUID();
        var offer = new PerformanceAdmissionSnapshot.Offer(
                UUID.randomUUID(), "Standard", java.math.BigDecimal.valueOf(100_000), true);
        var starts = OffsetDateTime.now().plusDays(10).withNano(0);
        java.util.function.BiFunction<Long, Boolean, PerformanceAdmissionSnapshot> snapshot =
                (version, suspended) ->
                        new PerformanceAdmissionSnapshot(
                                id, organization, null, version, "Show", "Hall", "Street", starts, null,
                                starts.minusDays(5), starts.minusHours(1), "ON_SALE", suspended, null, true, 4,
                                List.of(offer));
        java.util.function.Supplier<Boolean> suspended = () ->
                jdbc.queryForObject("SELECT sales_suspended FROM concerts WHERE id=?", Boolean.class, id);

        transaction.executeWithoutResult(status -> receiver.performance(snapshot.apply(1L, false)));
        assertThat(suspended.get()).isFalse();
        // An organizer pause arrives as a newer version with salesSuspended set; Check-in applies it.
        transaction.executeWithoutResult(status -> receiver.performance(snapshot.apply(2L, true)));
        assertThat(suspended.get()).isTrue();
        transaction.executeWithoutResult(status -> receiver.performance(snapshot.apply(3L, false)));
        assertThat(suspended.get()).isFalse();
        // Replaying the older paused version does not suspend the performance again.
        assertThat(transaction.<Long>execute(status -> receiver.performance(snapshot.apply(2L, true))))
                .isEqualTo(3L);
        assertThat(suspended.get()).isFalse();
    }

    private String ticketStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM tickets WHERE id=?", String.class, id);
    }

    private String title(UUID id) {
        return jdbc.queryForObject("SELECT title FROM concerts WHERE id=?", String.class, id);
    }
}
