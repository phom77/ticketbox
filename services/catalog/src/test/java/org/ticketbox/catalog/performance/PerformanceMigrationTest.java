package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class PerformanceMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static JdbcTemplate jdbc;

    @BeforeAll
    static void migrate() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        jdbc = new JdbcTemplate(source);
    }

    @Test
    void categorisesDemoEventsWithFixedIds() {
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM events WHERE legacy_concert_id IS NOT NULL
                AND id::text LIKE '10000000-%' AND category IS NULL
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForList("SELECT DISTINCT category FROM events WHERE category IS NOT NULL", String.class))
                .isSubsetOf("concerts", "festivals", "sports", "arts-theater", "comedy", "family");
        assertThat(jdbc.queryForObject("SELECT category FROM events WHERE id='10000000-0000-0000-0000-000000000018'",
                String.class)).isEqualTo("arts-theater");
    }

    @Test
    void backfillsLegacyIdsAndContinuouslyExposesLegacyChangesWithoutWritingLegacyInventory() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM concerts", Integer.class)).isPositive();
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM concerts c
                JOIN events e ON e.legacy_concert_id=c.id AND e.id=c.id
                JOIN performances p ON p.event_id=e.id AND p.legacy_concert_id=c.id AND p.id=c.id
                JOIN catalog_performance_view v ON v.id=p.id AND v.starts_at=c.event_date
                """, Integer.class)).isEqualTo(jdbc.queryForObject("SELECT count(*) FROM concerts", Integer.class));

        UUID concert = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,created_by)
                VALUES (?, 'Legacy fixture', 'Legacy room', 'Legacy address', now(), ?)
                """, concert, UUID.randomUUID());
        assertThat(jdbc.queryForObject("SELECT legacy_concert_id FROM performances WHERE id=?", UUID.class, concert))
                .isEqualTo(concert);
        jdbc.update("UPDATE concerts SET venue_name='Updated room', status='ON_SALE' WHERE id=?", concert);
        assertThat(jdbc.queryForObject("SELECT venue_name FROM catalog_performance_view WHERE id=?", String.class, concert))
                .isEqualTo("Updated room");
        jdbc.update("DELETE FROM concerts WHERE id=?", concert);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performances WHERE id=?", Integer.class, concert)).isZero();
    }
}
