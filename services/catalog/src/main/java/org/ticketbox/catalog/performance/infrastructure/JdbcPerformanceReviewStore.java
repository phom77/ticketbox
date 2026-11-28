package org.ticketbox.catalog.performance.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore;

@Repository
public class JdbcPerformanceReviewStore implements PerformanceReviewStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public JdbcPerformanceReviewStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public Optional<Review> current(UUID performanceId) {
        return jdbc.query("""
                SELECT * FROM performance_publication_reviews WHERE performance_id=?
                ORDER BY submitted_at DESC,id LIMIT 1
                """, this::review, performanceId).stream().findFirst();
    }

    @Override
    public List<Review> queue() {
        return jdbc.query("""
                SELECT * FROM (
                    SELECT DISTINCT ON (performance_id) * FROM performance_publication_reviews
                    ORDER BY performance_id,submitted_at DESC,id
                ) review WHERE state IN ('SUBMITTED','SCHEDULED','HELD','MISSED')
                ORDER BY publish_at NULLS FIRST,id LIMIT 200
                """, this::review);
    }

    @Override
    public List<UUID> due(OffsetDateTime now) {
        return jdbc.query("""
                SELECT performance_id FROM performance_publication_reviews
                WHERE state='SCHEDULED' AND publish_at<=? ORDER BY publish_at,id LIMIT 64
                """, (row, index) -> row.getObject(1, UUID.class), now);
    }

    @Override
    public void submit(Review review) {
        var versions = review.versions();
        jdbc.update("""
                INSERT INTO performance_publication_reviews
                (id,performance_id,submitted_by,publish_at,sale_version,layout_version,event_draft_version,
                 schedule_draft_version,summary,state,release_on_approval)
                VALUES (?,?,?,?,?,?,?,?,CAST(? AS jsonb),'SUBMITTED',?)
                """, review.id(), review.performanceId(), review.submittedBy(), review.publishAt(),
                versions.sale(), versions.layout(), versions.event(), versions.schedule(), serialize(review.summary()),
                review.releaseOnApproval());
    }

    @Override
    public void decide(UUID id, State state, UUID reviewer, String reason, OffsetDateTime publishAt) {
        jdbc.update("""
                UPDATE performance_publication_reviews SET state=?,reviewer_id=?,reason=?,decided_at=clock_timestamp(),
                    publish_at=COALESCE(?,publish_at)
                WHERE id=?
                """, state.name(), reviewer, reason, publishAt, id);
    }

    @Override
    public void transition(UUID id, State state) {
        jdbc.update("UPDATE performance_publication_reviews SET state=? WHERE id=?", state.name(), id);
    }

    private Review review(ResultSet row, int index) throws SQLException {
        try {
            return new Review(row.getObject("id", UUID.class), row.getObject("performance_id", UUID.class),
                    row.getObject("submitted_by", UUID.class), row.getObject("publish_at", OffsetDateTime.class),
                    new Versions(row.getLong("sale_version"), row.getLong("layout_version"),
                            row.getLong("event_draft_version"), row.getLong("schedule_draft_version")),
                    json.readValue(row.getString("summary"), Summary.class), State.valueOf(row.getString("state")),
                    row.getObject("reviewer_id", UUID.class), row.getString("reason"),
                    row.getBoolean("release_on_approval"));
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Invalid performance review summary", failure);
        }
    }

    private String serialize(Summary summary) {
        try {
            return json.writeValueAsString(summary);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Cannot write performance review summary", failure);
        }
    }
}
