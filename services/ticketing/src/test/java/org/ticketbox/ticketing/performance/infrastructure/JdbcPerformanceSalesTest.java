package org.ticketbox.ticketing.performance.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
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
import org.ticketbox.ticketing.performance.domain.PerformanceSale;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Group;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Kind;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Offer;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Seat;

@Testcontainers
class JdbcPerformanceSalesTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    static JdbcTemplate jdbc;
    static TransactionTemplate tx;
    static JdbcPerformanceCatalog catalog;

    @BeforeAll
    static void migrate() {
        var dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(dataSource).load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        catalog = new JdbcPerformanceCatalog(jdbc, new ObjectMapper().findAndRegisterModules());
    }

    @Test
    void replayAndStalePublicationDoNotResetLeftoverStock() {
        var sale = sale(false);
        var group = sale.groups().getFirst();
        assertThat(tx.<Long>execute(status -> catalog.apply(sale))).isEqualTo(1L);
        assertThat(tx.<Boolean>execute(status -> catalog.usesPerformanceStock(sale.id()))).isTrue();
        jdbc.update("""
                UPDATE performance_groups SET available=0, held=1 WHERE performance_id=? AND id=?
                """, sale.id(), group.id());
        var next = copy(sale, 3, "New name", sale.groups());
        assertThat(tx.<Long>execute(status -> catalog.apply(next))).isEqualTo(3L);
        assertThat(tx.<Long>execute(status -> catalog.apply(sale))).isEqualTo(3L);
        assertThat(tx.<Long>execute(status -> catalog.apply(next))).isEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT held FROM performance_groups WHERE performance_id=?",
                Integer.class, sale.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT title FROM concerts WHERE id=?",
                String.class, sale.id())).isEqualTo("New name");
        assertThatThrownBy(() -> tx.execute(status -> catalog.apply(copy(next, 3, "Different", sale.groups()))))
                .isInstanceOf(IllegalStateException.class);
        var resized = new Group(group.id(), null, group.sectionLabel(), 2, Kind.GA, List.of());
        assertThatThrownBy(() -> tx.execute(status -> catalog.apply(copy(sale, 4, "New name", List.of(resized)))))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void keepsOptionalClassificationFieldsAndToleratesTheirAbsence() throws Exception {
        var mapper = new ObjectMapper().findAndRegisterModules();
        var plain = sale(false);
        // A payload from before classification existed has no such properties and reads them as null.
        var tree = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(plain);
        tree.remove(List.of("segment", "primaryGenre", "city"));
        var legacy = mapper.treeToValue(tree, PerformanceSale.class);
        assertThat(legacy.segment()).isNull();
        assertThat(legacy.primaryGenre()).isNull();
        assertThat(legacy.city()).isNull();
        assertThat(tx.<Long>execute(status -> catalog.apply(legacy))).isEqualTo(1L);

        // A newer version carrying the fields is stored with them; null values are accepted too.
        var classified = withClassification(legacy, 2, "concerts", "vpop", "Hanoi");
        assertThat(tx.<Long>execute(status -> catalog.apply(classified))).isEqualTo(2L);
        var stored = jdbc.queryForObject("SELECT source_payload::text FROM performance_sales WHERE id=?", String.class,
                legacy.id());
        var node = mapper.readTree(stored);
        assertThat(node.path("segment").asText()).isEqualTo("concerts");
        assertThat(node.path("primaryGenre").asText()).isEqualTo("vpop");
        assertThat(node.path("city").asText()).isEqualTo("Hanoi");

        // An older version that lacks the fields is still ignored and does not erase them.
        assertThat(tx.<Long>execute(status -> catalog.apply(legacy))).isEqualTo(2L);
        assertThat(mapper.readTree(jdbc.queryForObject("SELECT source_payload::text FROM performance_sales WHERE id=?",
                String.class, legacy.id())).path("primaryGenre").asText()).isEqualTo("vpop");

        var cleared = withClassification(legacy, 3, null, null, null);
        assertThat(tx.<Long>execute(status -> catalog.apply(cleared))).isEqualTo(3L);
        assertThat(mapper.readTree(jdbc.queryForObject("SELECT source_payload::text FROM performance_sales WHERE id=?",
                String.class, legacy.id())).path("segment").isNull()).isTrue();
    }

    private static PerformanceSale withClassification(PerformanceSale sale, long version, String segment, String genre,
                                                      String city) {
        return new PerformanceSale(sale.id(), sale.eventId(), sale.organizationId(), sale.legacyConcertId(), version,
                sale.layoutVersion(), sale.layoutChecksum(), sale.title(), sale.venueName(), sale.startsAt(),
                sale.endsAt(), sale.doorsOpenAt(), sale.timezone(), sale.saleStartAt(), sale.saleEndAt(), sale.status(),
                sale.salesSuspended(), sale.publicVisible(), sale.resumedAdmissionAt(), sale.maxPerAccount(),
                sale.groups(), sale.offers(), segment, genre, city);
    }

    @Test
    void concurrentOfferWritersCanOnlyHoldOneRemainingPlace() throws Exception {
        var sale = sale(false);
        tx.execute(status -> catalog.apply(sale));
        UUID group = sale.groups().getFirst().id();
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> jdbc.update("""
                    UPDATE performance_groups SET available=available-1, held=held+1
                    WHERE performance_id=? AND id=? AND available >= 1
                    """, sale.id(), group));
            var second = workers.submit(() -> jdbc.update("""
                    UPDATE performance_groups SET available=available-1, held=held+1
                    WHERE performance_id=? AND id=? AND available >= 1
                    """, sale.id(), group));
            assertThat(first.get()+second.get()).isEqualTo(1);
        }
    }

    @Test
    void offerDetailsAreStoredForNewerVersionsAndAbsentMeansMinimumOne() throws Exception {
        var sale = sale(false);
        tx.execute(status -> catalog.apply(sale));
        var offerId = sale.offers().getFirst().id();
        assertThat(jdbc.queryForObject("SELECT min_per_order FROM performance_offers WHERE id=?", Integer.class, offerId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT description FROM performance_offers WHERE id=?", String.class, offerId))
                .isNull();

        var detailed = new Offer(offerId, sale.groups().getFirst().id(), "Early", BigDecimal.valueOf(150_000), "VND",
                sale.offers().getFirst().saleStartAt(), sale.offers().getFirst().saleEndAt(), true,
                "Includes a poster", 2);
        var next = new PerformanceSale(sale.id(), sale.eventId(), sale.organizationId(), null, 2, null, null,
                sale.title(), sale.venueName(), sale.startsAt(), sale.endsAt(), null, sale.timezone(),
                sale.saleStartAt(), sale.saleEndAt(), sale.status(), false, true, null, sale.maxPerAccount(),
                sale.groups(), List.of(detailed, sale.offers().getLast()));
        assertThat(tx.<Long>execute(status -> catalog.apply(next))).isEqualTo(2L);
        assertThat(jdbc.queryForObject("SELECT min_per_order FROM performance_offers WHERE id=?", Integer.class, offerId))
                .isEqualTo(2);
        // A replayed older version is ignored and does not erase the details.
        assertThat(tx.<Long>execute(status -> catalog.apply(sale))).isEqualTo(2L);
        assertThat(jdbc.queryForObject("SELECT description FROM performance_offers WHERE id=?", String.class, offerId))
                .isEqualTo("Includes a poster");
        // Payloads written before the fields existed decode with a minimum of 1.
        var mapper = new ObjectMapper().findAndRegisterModules();
        var tree = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(sale.offers().getFirst());
        tree.remove("description");
        tree.remove("minPerOrder");
        assertThat(mapper.treeToValue(tree, Offer.class).minPerOrder()).isEqualTo(1);
    }

    static PerformanceSale sale(boolean assigned) {
        var now = OffsetDateTime.now(ZoneOffset.UTC).withNano(0);
        UUID group = UUID.randomUUID();
        UUID section = assigned ? UUID.randomUUID() : null;
        return new PerformanceSale(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null, 1,
                assigned ? 1L : null, assigned ? "a".repeat(64) : null, "Test show", "Venue",
                now.plusDays(2), now.plusDays(2).plusHours(2), null, "Asia/Ho_Chi_Minh",
                now.minusDays(1), now.plusDays(1), "ON_SALE", false, true, null, 4,
                List.of(new Group(group, section, "Main", 1, assigned ? Kind.ASSIGNED : Kind.GA,
                        assigned ? List.of(new Seat(UUID.randomUUID(), "A", "1", false)) : List.of())),
                List.of(new Offer(UUID.randomUUID(), group, "Early", BigDecimal.valueOf(150_000), "VND",
                        now.minusDays(1), now.plusDays(1), true),
                        new Offer(UUID.randomUUID(), group, "Standard", BigDecimal.valueOf(200_000), "VND",
                                now.minusDays(1), now.plusDays(1), true)), null, null, null);
    }

    private static PerformanceSale copy(PerformanceSale sale, long version, String title, List<Group> groups) {
        return new PerformanceSale(sale.id(), sale.eventId(), sale.organizationId(), sale.legacyConcertId(),
                version, sale.layoutVersion(), sale.layoutChecksum(), title, sale.venueName(), sale.startsAt(),
                sale.endsAt(), sale.doorsOpenAt(), sale.timezone(), sale.saleStartAt(), sale.saleEndAt(),
                sale.status(), sale.salesSuspended(), sale.publicVisible(), sale.resumedAdmissionAt(),
                sale.maxPerAccount(), groups, sale.offers(), sale.segment(), sale.primaryGenre(), sale.city());
    }
}
