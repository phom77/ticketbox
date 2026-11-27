package org.ticketbox.catalog.performance.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.content.domain.ConcertContent;
import org.ticketbox.catalog.performance.application.EventContentStore;
import org.ticketbox.catalog.performance.domain.EventContent;
import org.ticketbox.catalog.performance.domain.EventContentRevision;
import org.ticketbox.catalog.performance.domain.EventContentRevision.PosterEdit;
import org.ticketbox.catalog.performance.domain.EventContentRevision.State;

@Repository
public class JdbcEventContentStore implements EventContentStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public JdbcEventContentStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public Optional<Live> live(UUID eventId) {
        return jdbc.query("""
                SELECT title, description, localized_content, artist_bio, age_rating, refund_policy, poster_url,
                       poster_public_id, content_version FROM events WHERE id=? AND legacy_concert_id IS NULL
                """, (rs, n) -> new Live(new EventContent(rs.getString("title"), rs.getString("description"),
                        translations(rs.getString("localized_content")), rs.getString("artist_bio"),
                        rs.getString("age_rating"), rs.getString("refund_policy")),
                        new Poster(rs.getString("poster_url"), rs.getString("poster_public_id")),
                        rs.getLong("content_version")), eventId).stream().findFirst();
    }

    @Override
    public Optional<Long> lockContentVersion(UUID eventId, UUID organization) {
        return jdbc.query("""
                SELECT content_version FROM events
                WHERE id=? AND organization_id=? AND legacy_concert_id IS NULL FOR NO KEY UPDATE
                """, (rs, n) -> rs.getLong("content_version"), eventId, organization).stream().findFirst();
    }

    @Override
    public void writeCategory(UUID eventId, String category) {
        jdbc.update("UPDATE events SET category=? WHERE id=?", category, eventId);
    }

    @Override
    public void write(UUID eventId, EventContent content) {
        jdbc.update("""
                UPDATE events SET title=?, description=?, localized_content=?, artist_bio=?, age_rating=?,
                  refund_policy=?, content_version=content_version+1, draft_version=draft_version+1
                WHERE id=?
                """, content.title(), content.description(), localized(content), content.artistBio(),
                content.ageRating(), content.refundPolicy(), eventId);
    }

    @Override
    public void writePoster(UUID eventId, Poster poster) {
        jdbc.update("""
                UPDATE events SET poster_url=?, poster_public_id=?, content_version=content_version+1,
                  draft_version=draft_version+1 WHERE id=?
                """, poster.url(), poster.publicId(), eventId);
    }

    private void applyPoster(UUID eventId, Poster poster) {
        jdbc.update("UPDATE events SET poster_url=?, poster_public_id=?, content_version=content_version+1 WHERE id=?",
                poster.url(), poster.publicId(), eventId);
    }

    @Override
    public void apply(UUID eventId, EventContent content, PosterEdit poster) {
        jdbc.update("""
                UPDATE events SET title=?, description=?, localized_content=?, artist_bio=?, age_rating=?,
                  refund_policy=?, content_version=content_version+1 WHERE id=?
                """, content.title(), content.description(), localized(content), content.artistBio(),
                content.ageRating(), content.refundPolicy(), eventId);
        if (poster.changed()) applyPoster(eventId, new Poster(poster.url(), poster.publicId()));
    }

    @Override
    public Optional<EventContentRevision> revision(UUID eventId) {
        return jdbc.query("SELECT * FROM event_content_revisions WHERE event_id=?", (rs, n) -> revision(rs), eventId)
                .stream().findFirst();
    }

    @Override
    public void save(EventContentRevision revision) {
        jdbc.update("""
                INSERT INTO event_content_revisions(event_id, revision, base_content_version, details, poster_changed,
                    poster_url, poster_public_id, state, submitted_by, submitted_at, reviewer_id, decided_at, reason)
                VALUES (?,?,?,CAST(? AS jsonb),?,?,?,?,?,?,?,?,?)
                ON CONFLICT (event_id) DO UPDATE SET revision=EXCLUDED.revision,
                    base_content_version=EXCLUDED.base_content_version, details=EXCLUDED.details,
                    poster_changed=EXCLUDED.poster_changed, poster_url=EXCLUDED.poster_url,
                    poster_public_id=EXCLUDED.poster_public_id, state=EXCLUDED.state,
                    submitted_by=EXCLUDED.submitted_by, submitted_at=EXCLUDED.submitted_at,
                    reviewer_id=EXCLUDED.reviewer_id, decided_at=EXCLUDED.decided_at, reason=EXCLUDED.reason,
                    updated_at=now()
                """, revision.eventId(), revision.revision(), revision.baseContentVersion(), write(revision.content()),
                revision.poster().changed(), revision.poster().url(), revision.poster().publicId(),
                revision.state().name(), revision.submittedBy(), revision.submittedAt(), revision.reviewerId(),
                revision.decidedAt(), revision.reason());
    }

    @Override
    public void deleteRevision(UUID eventId) {
        jdbc.update("DELETE FROM event_content_revisions WHERE event_id=?", eventId);
    }

    @Override
    public Page<QueueRow> queue(State state, Pageable page) {
        long total = jdbc.queryForObject("SELECT count(*) FROM event_content_revisions WHERE state=?", Long.class,
                state.name());
        var rows = jdbc.query("""
                SELECT r.event_id, e.organization_id, e.title, r.state, r.revision, r.submitted_at, r.reason
                FROM event_content_revisions r JOIN events e ON e.id=r.event_id WHERE r.state=?
                ORDER BY r.submitted_at NULLS LAST, r.event_id LIMIT ? OFFSET ?
                """, (rs, n) -> new QueueRow(rs.getObject("event_id", UUID.class),
                rs.getObject("organization_id", UUID.class), rs.getString("title"), State.valueOf(rs.getString("state")),
                rs.getLong("revision"), rs.getObject("submitted_at", OffsetDateTime.class), rs.getString("reason")),
                state.name(), page.getPageSize(), page.getOffset());
        return new PageImpl<>(rows, page, total);
    }

    @Override
    public Optional<UUID> organization(UUID eventId) {
        return jdbc.query("SELECT organization_id FROM events WHERE id=? AND legacy_concert_id IS NULL",
                (rs, n) -> rs.getObject("organization_id", UUID.class), eventId).stream().findFirst();
    }

    @Override
    public Optional<Boolean> lockEventNative(UUID eventId) {
        return jdbc.query("SELECT legacy_concert_id IS NULL AS native FROM events WHERE id=? FOR NO KEY UPDATE",
                (rs, n) -> rs.getBoolean("native"), eventId).stream().findFirst();
    }

    @Override
    public boolean releasedOrInReview(UUID performanceId) {
        return jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM performance_publication_reviews
                    WHERE performance_id=? AND state IN ('SUBMITTED','SCHEDULED','RELEASED'))
                    OR EXISTS(SELECT 1 FROM performance_sale_publications WHERE performance_id=?)
                """, Boolean.class, performanceId, performanceId);
    }

    @Override
    public List<UUID> performanceIds(UUID eventId) {
        return jdbc.query("SELECT id FROM performances WHERE event_id=? ORDER BY id FOR UPDATE",
                (rs, n) -> rs.getObject("id", UUID.class), eventId);
    }

    @Override
    public List<String> storedPosterIds(UUID eventId) {
        return jdbc.query("""
                SELECT poster_public_id FROM events WHERE id=? AND poster_public_id IS NOT NULL
                UNION SELECT poster_public_id FROM event_content_revisions WHERE event_id=? AND poster_public_id IS NOT NULL
                """, (rs, n) -> rs.getString(1), eventId, eventId);
    }

    @Override
    public void deletePerformance(UUID id) {
        var backgrounds = jdbc.queryForList("SELECT id FROM layout_backgrounds WHERE source_performance_id=?",
                UUID.class, id);
        jdbc.update("DELETE FROM performances WHERE id=?", id);
        deleteUnreferencedBackgrounds(backgrounds);
    }

    @Override
    public void deleteEvent(UUID id) {
        var backgrounds = jdbc.queryForList("""
                SELECT b.id FROM layout_backgrounds b JOIN performances p ON p.id=b.source_performance_id
                WHERE p.event_id=?
                """, UUID.class, id);
        jdbc.update("DELETE FROM events WHERE id=?", id);
        deleteUnreferencedBackgrounds(backgrounds);
    }

    /** The performance delete cascades its layouts; what remains referenced by a layout, draft or template stays. */
    private void deleteUnreferencedBackgrounds(List<UUID> candidates) {
        for (UUID background : candidates) {
            jdbc.update("""
                    DELETE FROM layout_backgrounds b WHERE b.id=?
                      AND NOT EXISTS (SELECT 1 FROM performance_layouts l WHERE l.background_id=b.id)
                      AND NOT EXISTS (SELECT 1 FROM performance_layout_drafts d
                                      WHERE strpos(d.document::text, b.id::text) > 0)
                      AND NOT EXISTS (SELECT 1 FROM layout_revisions r WHERE strpos(r.document::text, b.id::text) > 0)
                    """, background);
        }
    }

    @Override
    public void audit(UUID actor, UUID organization, String action, UUID subject, String details) {
        jdbc.update("INSERT INTO organizer_audit_log(id, actor_id, organization_id, action, subject_id, details) VALUES (?,?,?,?,?,?)",
                UUID.randomUUID(), actor, organization, action, subject, details);
    }

    private EventContentRevision revision(ResultSet rs) throws SQLException {
        return new EventContentRevision(rs.getObject("event_id", UUID.class), rs.getLong("revision"),
                rs.getLong("base_content_version"), read(rs.getString("details")),
                new PosterEdit(rs.getBoolean("poster_changed"), rs.getString("poster_url"), rs.getString("poster_public_id")),
                State.valueOf(rs.getString("state")), rs.getObject("submitted_by", UUID.class),
                rs.getObject("submitted_at", OffsetDateTime.class), rs.getObject("reviewer_id", UUID.class),
                rs.getObject("decided_at", OffsetDateTime.class), rs.getString("reason"));
    }

    private String localized(EventContent content) {
        return content.translations().isEmpty() ? null : write(new ConcertContent(null, content.translations()));
    }

    private Map<String, org.ticketbox.catalog.content.domain.ConcertText> translations(String value) {
        if (value == null) return Map.of();
        try {
            return json.readValue(value, ConcertContent.class).translations();
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Could not decode event content", failure);
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Could not encode event content", failure);
        }
    }

    private EventContent read(String value) {
        try {
            return json.readValue(value, EventContent.class);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Could not decode event content revision", failure);
        }
    }
}
