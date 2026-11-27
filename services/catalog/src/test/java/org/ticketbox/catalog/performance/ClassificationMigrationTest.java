package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** V22 on a database that already holds events with every old category value. */
@Testcontainers
class ClassificationMigrationTest {
    // One database per test: the first test needs a schema that stops at V21.
    @Container
    final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void mapsEveryOldCategoryToASegmentAndComedyToStandUp() {
        var source = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(source).target("21").load().migrate();
        var jdbc = new JdbcTemplate(source);
        UUID organization = UUID.randomUUID();
        var expected = new java.util.LinkedHashMap<String, String[]>();
        expected.put("concerts", new String[] {"concerts", null});
        expected.put("festivals", new String[] {"festivals", null});
        expected.put("sports", new String[] {"sports", null});
        expected.put("arts-theater", new String[] {"arts-theater-comedy", null});
        expected.put("comedy", new String[] {"arts-theater-comedy", "stand-up"});
        expected.put("family", new String[] {"family", null});
        Map<String, UUID> ids = new java.util.LinkedHashMap<>();
        for (String category : expected.keySet()) {
            UUID id = UUID.randomUUID();
            ids.put(category, id);
            jdbc.update("INSERT INTO events(id,organization_id,title,category) VALUES (?,?,?,?)", id, organization,
                    "Event " + category, category);
        }
        UUID none = UUID.randomUUID();
        jdbc.update("INSERT INTO events(id,organization_id,title) VALUES (?,?,'No category')", none, organization);

        Flyway.configure().dataSource(source).load().migrate();

        expected.forEach((category, values) -> {
            var row = jdbc.queryForMap("SELECT segment_id, primary_genre_id, category FROM events WHERE id=?",
                    ids.get(category));
            assertThat(row.get("segment_id")).as(category).isEqualTo(values[0]);
            assertThat(row.get("primary_genre_id")).as(category).isEqualTo(values[1]);
            assertThat(row.get("category")).as("the old column is kept unwritten").isEqualTo(category);
        });
        var unclassified = jdbc.queryForMap("SELECT segment_id, primary_genre_id FROM events WHERE id=?", none);
        assertThat(unclassified.get("segment_id")).isNull();
        assertThat(unclassified.get("primary_genre_id")).isNull();

        // Demo seed events got a genre that belongs to their segment.
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM events WHERE id::text LIKE '10000000-%' AND legacy_concert_id IS NOT NULL
                AND (segment_id IS NULL OR primary_genre_id IS NULL)
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForList("SELECT id FROM classification_segments ORDER BY sort", String.class))
                .containsExactly("concerts", "festivals", "sports", "arts-theater-comedy", "family", "other");
    }

    @Test
    void theSharedIdListMatchesTheReferenceRows() throws Exception {
        var source = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        var jdbc = new JdbcTemplate(source);
        var directory = java.nio.file.Path.of("").toAbsolutePath();
        while (directory != null && !java.nio.file.Files.exists(directory.resolve("contracts/classification-ids.json"))) {
            directory = directory.getParent();
        }
        assertThat(directory).as("repository root with contracts/").isNotNull();
        var contract = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(directory.resolve("contracts/classification-ids.json").toFile());
        var fromContract = new java.util.ArrayList<String>();
        for (var segment : contract.path("segments")) {
            fromContract.add(segment.path("id").asText());
            for (var genre : segment.path("genres")) {
                fromContract.add(segment.path("id").asText() + "/" + genre.path("id").asText() + "/"
                        + genre.path("popular").asBoolean());
            }
        }
        var fromDatabase = new java.util.ArrayList<String>();
        for (var segment : jdbc.queryForList("SELECT id FROM classification_segments ORDER BY sort", String.class)) {
            fromDatabase.add(segment);
            fromDatabase.addAll(jdbc.query("SELECT id, popular FROM classification_genres WHERE segment_id=? ORDER BY sort",
                    (rs, n) -> segment + "/" + rs.getString("id") + "/" + rs.getBoolean("popular"), segment));
        }
        assertThat(fromContract).isEqualTo(fromDatabase);
    }

    @Test
    void theCompositeKeyKeepsThePrimaryGenreInsideTheSegment() {
        var source = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        var jdbc = new JdbcTemplate(source);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO events(id,organization_id,title) VALUES (?,?,'Keyed')", id, UUID.randomUUID());
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE events SET segment_id='sports', primary_genre_id='vpop' WHERE id=?", id));
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("UPDATE events SET primary_genre_id='football' WHERE id=?", id));
        jdbc.update("UPDATE events SET segment_id='sports', primary_genre_id='football' WHERE id=?", id);
        assertThat(List.of(jdbc.queryForObject("SELECT primary_genre_id FROM events WHERE id=?", String.class, id)))
                .containsExactly("football");
    }
}
