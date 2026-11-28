package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class GuidedSchedulingMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void migratesVersion23DataBackfillingTheVenueCityAndKeepingReviewsAndPerformances() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).target("23").load().migrate();
        var jdbc = new JdbcTemplate(source);
        UUID organization = UUID.randomUUID();
        UUID withCity = UUID.randomUUID();
        UUID withoutCity = UUID.randomUUID();
        jdbc.update("INSERT INTO venues(id,organization_id,name,address) VALUES (?,?,'Hall','12 Nguyen Hue, Quan 1, Ho Chi Minh, Viet Nam')",
                withCity, organization);
        jdbc.update("INSERT INTO venues(id,organization_id,name,address) VALUES (?,?,'Barn','Just a field')",
                withoutCity, organization);
        UUID space = UUID.randomUUID();
        jdbc.update("INSERT INTO venue_spaces(id,venue_id,name) VALUES (?,?,'Main')", space, withCity);
        UUID event = UUID.randomUUID();
        jdbc.update("INSERT INTO events(id,organization_id,title) VALUES (?,?,'Show')", event, organization);
        UUID performance = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO performances(id,event_id,venue_space_id,starts_at,ends_at,timezone,sale_start_at,sale_end_at)
                VALUES (?,?,?,now()+interval '10 days',now()+interval '10 days 2 hours','Asia/Ho_Chi_Minh',
                        now()+interval '1 day',now()+interval '10 days')
                """, performance, event, space);
        UUID review = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO performance_publication_reviews(id,performance_id,submitted_by,publish_at,sale_version,
                    layout_version,event_draft_version,schedule_draft_version,summary,state)
                VALUES (?,?,?,now()+interval '2 days',1,0,0,0,'{}'::jsonb,'SUBMITTED')
                """, review, performance, UUID.randomUUID());

        Flyway.configure().dataSource(source).load().migrate();

        assertThat(jdbc.queryForObject("SELECT city FROM venues WHERE id=?", String.class, withCity))
                .isEqualTo("Ho Chi Minh");
        assertThat(jdbc.queryForObject("SELECT city FROM venues WHERE id=?", String.class, withoutCity)).isNull();
        assertThat(jdbc.queryForObject("SELECT timezone FROM venues WHERE id=?", String.class, withCity))
                .isEqualTo("Asia/Ho_Chi_Minh");
        assertThat(jdbc.queryForObject("SELECT version FROM venues WHERE id=?", Long.class, withCity)).isZero();
        assertThat(jdbc.queryForObject("SELECT venue_city FROM catalog_performance_view WHERE id=?", String.class,
                performance)).isEqualTo("Ho Chi Minh");
        assertThat(jdbc.queryForObject("SELECT release_on_approval FROM performance_publication_reviews WHERE id=?",
                Boolean.class, review)).isFalse();
        // Coordinates are both set or both empty; a review needs a release time unless it releases on approval.
        assertThatThrownBy(() -> jdbc.update("UPDATE venues SET latitude=10 WHERE id=?", withCity))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE performance_publication_reviews SET publish_at=NULL WHERE id=?",
                review)).isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("UPDATE performance_publication_reviews SET publish_at=NULL, release_on_approval=true WHERE id=?",
                review);
        // Only a draft may lack its sale start; a released performance keeps the old rule.
        jdbc.update("UPDATE performances SET sale_start_at=NULL WHERE id=?", performance);
        assertThatThrownBy(() -> jdbc.update("UPDATE performances SET status='ON_SALE' WHERE id=?", performance))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
