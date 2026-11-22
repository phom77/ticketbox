package org.ticketbox.catalog.concert.infrastructure.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.concert.application.port.ConcertPublicationStore;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcConcertPublicationStore implements ConcertPublicationStore {
    private static final String SNAPSHOT = """
            jsonb_build_object('concert',
                to_jsonb(c) - ARRAY['id','organization_id','created_by','created_at','updated_at',
                                   'status','sales_suspended','resumed_admission_at'],
                'tiers', COALESCE((SELECT jsonb_agg(
                    to_jsonb(t) - ARRAY['available_qty','created_at','updated_at'] ORDER BY t.id)
                    FROM ticket_types t WHERE t.concert_id=c.id), '[]'),
                'edit', (SELECT details FROM concert_publication_edits e WHERE e.concert_id=c.id))
            """;
    private static final String SELECT_REVIEW = """
            SELECT r.id,r.concert_id,r.state,r.publish_at,COALESCE(r.hold_reason,r.reason) reason,r.reviewer_id,r.decided_at,
                   c.title,c.sale_start_at,r.resume_hold,%s proposed_edit
            FROM concert_publication_reviews r JOIN concerts c ON c.id=r.concert_id
            """;
    private final JdbcTemplate db;
    private final ObjectMapper json;

    JdbcConcertPublicationStore(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    private final RowMapper<Review> mapper = (row, index) -> new Review(
            row.getObject("id", UUID.class), row.getObject("concert_id", UUID.class), row.getString("title"),
            State.valueOf(row.getString("state")), row.getObject("publish_at", OffsetDateTime.class),
            row.getObject("sale_start_at", OffsetDateTime.class), row.getString("reason"),
            row.getObject("reviewer_id", UUID.class), row.getObject("decided_at", OffsetDateTime.class),
            readEdit(row.getString("proposed_edit")), row.getBoolean("resume_hold"));

    public Optional<Review> current(UUID concertId) {
        return db.query(SELECT_REVIEW.formatted("NULLIF(r.snapshot->'edit','null'::jsonb)::text")
                        + " WHERE r.concert_id=? ORDER BY r.sequence DESC LIMIT 1",
                mapper, concertId).stream().findFirst();
    }

    public List<Review> queue() {
        return db.query(SELECT_REVIEW.formatted("NULL::text") + """
                WHERE r.sequence=(SELECT max(newest.sequence) FROM concert_publication_reviews newest
                                  WHERE newest.concert_id=r.concert_id)
                  AND r.state IN ('SUBMITTED','SCHEDULED','MISSED','HELD')
                ORDER BY r.publish_at,r.sequence LIMIT 100
                """, mapper);
    }

    public List<UUID> due(OffsetDateTime now) {
        return db.queryForList("""
                SELECT concert_id FROM concert_publication_reviews
                WHERE state='SCHEDULED' AND publish_at<=? ORDER BY publish_at,sequence LIMIT 100
                """, UUID.class, now);
    }

    public boolean matches(UUID reviewId) {
        return Boolean.TRUE.equals(db.queryForObject("""
                SELECT r.snapshot=%s FROM concert_publication_reviews r
                JOIN concerts c ON c.id=r.concert_id WHERE r.id=?
                """.formatted(SNAPSHOT), Boolean.class, reviewId));
    }

    public void submit(UUID id, UUID concertId, UUID actor, OffsetDateTime publishAt, boolean resumeHold) {
        db.update("""
                INSERT INTO concert_publication_reviews(id,concert_id,submitted_by,publish_at,state,snapshot,resume_hold)
                SELECT ?,c.id,?,?,'SUBMITTED',%s,? FROM concerts c WHERE c.id=?
                """.formatted(SNAPSHOT), id, actor, publishAt, resumeHold, concertId);
    }

    public boolean releasedBefore(UUID concertId) {
        return Boolean.TRUE.equals(db.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM concert_publication_reviews WHERE concert_id=? AND released_at IS NOT NULL)
                """, Boolean.class, concertId));
    }

    public Optional<StagedEdit> stagedEdit(UUID concertId) {
        return db.queryForList("SELECT details::text FROM concert_publication_edits WHERE concert_id=?",
                String.class, concertId).stream().findFirst().map(this::readEdit);
    }

    public void stageEdit(UUID concertId, StagedEdit edit) {
        var changes = json.createObjectNode();
        if (edit.details() != null) changes.set("details", json.valueToTree(edit.details()));
        if (edit.poster() != null) changes.set("poster", json.valueToTree(edit.poster()));
        if (edit.artistBio() != null) changes.put("artistBio", edit.artistBio());
        db.update("""
                INSERT INTO concert_publication_edits(concert_id,details) VALUES (?,?::jsonb)
                ON CONFLICT (concert_id) DO UPDATE
                    SET details=concert_publication_edits.details || excluded.details
                """, concertId, changes.toString());
    }

    public void clearStagedEdit(UUID concertId) {
        db.update("DELETE FROM concert_publication_edits WHERE concert_id=?", concertId);
    }

    private StagedEdit readEdit(String payload) {
        if (payload == null) return null;
        try {
            return json.readValue(payload, StagedEdit.class);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Cannot read the concert edit", failure);
        }
    }

    public void decide(UUID id, State state, UUID reviewer, String reason) {
        db.update("""
                UPDATE concert_publication_reviews SET state=?,reviewer_id=?,decided_at=clock_timestamp(),reason=?
                WHERE id=?
                """, state.name(), reviewer, reason, id);
    }

    public void hold(UUID id, UUID actor, String reason) {
        db.update("""
                UPDATE concert_publication_reviews SET state='HELD',held_by=?,held_at=clock_timestamp(),hold_reason=?
                WHERE id=?
                """, actor, reason, id);
    }

    public void transition(UUID id, State state) {
        db.update("""
                UPDATE concert_publication_reviews SET state=?,
                    released_at=CASE WHEN ?='RELEASED' THEN clock_timestamp() ELSE released_at END
                WHERE id=?
                """, state.name(), state.name(), id);
    }

    public void recordActivation(UUID concertId) {
        db.update("UPDATE sale_config_outbox SET activation_version=version WHERE concert_id=?", concertId);
    }
}
