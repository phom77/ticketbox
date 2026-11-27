package org.ticketbox.catalog.performance.infrastructure;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.performance.application.WorkspaceOperationsStore;

@Repository
public class JdbcWorkspaceOperationsStore implements WorkspaceOperationsStore {
    private static final String CURRENT_REVIEW = """
            LEFT JOIN LATERAL (
                SELECT r.id, r.state, r.submitted_at, r.publish_at, r.reason
                FROM performance_publication_reviews r WHERE r.performance_id = p.id
                    AND p.legacy_concert_id IS NULL
                ORDER BY r.submitted_at DESC, r.id LIMIT 1
            ) native_review ON true
            LEFT JOIN LATERAL (
                SELECT r.id, r.state, r.submitted_at, r.publish_at, COALESCE(r.hold_reason, r.reason) AS reason
                FROM concert_publication_reviews r WHERE r.concert_id = p.legacy_concert_id
                ORDER BY r.sequence DESC LIMIT 1
            ) legacy_review ON true
            """;
    private static final String REVIEW_STATE = "COALESCE(native_review.state, legacy_review.state)";
    private static final String REVIEW_SUBMITTED = "COALESCE(native_review.submitted_at, legacy_review.submitted_at)";
    private static final String REVIEW_REASON = "COALESCE(native_review.reason, legacy_review.reason)";
    /** The lifecycle status of one performance, from its status, latest review and schedule. */
    private static final String PERFORMANCE_STATUS = """
            CASE
                WHEN p.status = 'CANCELLED' THEN 'CANCELLED'
                WHEN p.status = 'COMPLETED' OR (p.status <> 'DRAFT' AND COALESCE(p.ends_at, p.starts_at) < CURRENT_TIMESTAMP)
                    THEN 'PAST'
                WHEN p.status = 'DRAFT' THEN CASE %1$s
                    WHEN 'SUBMITTED' THEN 'IN_REVIEW'
                    WHEN 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
                    WHEN 'SCHEDULED' THEN 'SCHEDULED'
                    ELSE 'DRAFT' END
                WHEN p.status = 'SOLD_OUT' THEN 'SOLD_OUT'
                ELSE 'ON_SALE'
            END
            """;
    private static final String STATUS_PRIORITY = """
            ARRAY['CHANGES_REQUESTED', 'IN_REVIEW', 'ON_SALE', 'SCHEDULED', 'SOLD_OUT', 'DRAFT', 'PAST', 'CANCELLED']
            """;
    private static final String EVENT_ROWS = """
            FROM catalog_event_view e
            JOIN events ev ON ev.id = e.id
            LEFT JOIN concerts lc ON lc.id = e.legacy_concert_id
            CROSS JOIN LATERAL (
                SELECT count(*) AS performance_count,
                    COALESCE(bool_or(p.status = 'DRAFT'), false) AS has_draft,
                    COALESCE(bool_or(%1$s = 'CHANGES_REQUESTED'), false) AS changes_requested,
                    min(p.starts_at) FILTER (
                        WHERE p.starts_at >= CURRENT_TIMESTAMP AND p.status NOT IN ('CANCELLED', 'COMPLETED')
                    ) AS next_starts_at,
                    (array_agg(p.id ORDER BY p.starts_at NULLS LAST, p.id)
                        FILTER (WHERE p.status = 'DRAFT'))[1] AS first_draft,
                    (array_agg(p.id ORDER BY %2$s DESC, p.id)
                        FILTER (WHERE %1$s = 'CHANGES_REQUESTED'))[1] AS needs_change,
                    (array_agg(%3$s ORDER BY %2$s DESC, p.id)
                        FILTER (WHERE %1$s = 'CHANGES_REQUESTED'))[1] AS change_reason,
                    COALESCE(array_agg(%5$s), CAST(ARRAY[] AS text[])) AS statuses
                FROM catalog_performance_view p
                %4$s
                WHERE p.event_id = e.id
            ) rollup
            WHERE true
            """.formatted(REVIEW_STATE, REVIEW_SUBMITTED, REVIEW_REASON, CURRENT_REVIEW,
            PERFORMANCE_STATUS.formatted(REVIEW_STATE));
    private static final String EVENT_COLUMNS = """
            SELECT e.id, e.title, e.description, ev.segment_id, ev.primary_genre_id, e.organization_id, e.legacy_concert_id,
                rollup.performance_count, (rollup.performance_count = 0 OR rollup.statuses && ARRAY['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED']) AS preparing,
                rollup.changes_requested, rollup.next_starts_at,
                COALESCE(rollup.needs_change, rollup.first_draft) AS action_performance_id, rollup.change_reason,
                COALESCE(ev.poster_url, lc.poster_url) AS poster_url,
                COALESCE((SELECT s FROM unnest(%s) WITH ORDINALITY AS priority(s, rank)
                          WHERE s = ANY(rollup.statuses) ORDER BY rank LIMIT 1), 'DRAFT') AS status,
                EXISTS (SELECT 1 FROM event_content_revisions r WHERE r.event_id = e.id AND r.state = 'SUBMITTED')
                    AS content_change_in_review
            """.formatted(STATUS_PRIORITY);
    private static final String SHOWS = """
            FROM catalog_performance_view p JOIN catalog_event_view e ON e.id = p.event_id
            """;
    private static final String PERFORMANCE_ROWS = SHOWS + CURRENT_REVIEW + """
            LEFT JOIN performance_sale_publications publication
                ON publication.performance_id = p.id AND publication.version = p.sale_version
            LEFT JOIN sale_config_outbox legacy_publication ON legacy_publication.concert_id = p.legacy_concert_id
            WHERE true
            """;
    private static final String PERFORMANCE_COLUMNS = """
            SELECT p.id, p.event_id, e.title, e.organization_id, p.legacy_concert_id, p.venue_name, p.space_name,
                p.starts_at, p.ends_at, p.timezone, p.status, p.sales_suspended, p.public_visible, p.sale_start_at, p.sale_end_at,
                NULLIF(%s, 'SUPERSEDED') AS publication_status,
                CASE WHEN p.legacy_concert_id IS NULL THEN publication.ticketing_ack
                    WHEN p.status <> 'DRAFT' THEN legacy_publication.ticketing_version >= legacy_publication.version
                END AS ticketing_acknowledged,
                CASE WHEN p.legacy_concert_id IS NULL THEN publication.checkin_ack
                    WHEN p.status <> 'DRAFT' THEN legacy_publication.checkin_version >= legacy_publication.version
                END AS checkin_acknowledged
            """.formatted(REVIEW_STATE);

    private static final String REVIEW_COLUMNS = """
            SELECT COALESCE(native_review.id, legacy_review.id) AS id, p.event_id, p.id AS performance_id,
                e.title, e.organization_id, p.legacy_concert_id,
                %s AS status, %s AS submitted_at, %s AS reason,
                COALESCE(native_review.publish_at, legacy_review.publish_at) AS publish_at
            """.formatted(REVIEW_STATE, REVIEW_SUBMITTED, REVIEW_REASON);
    private static final String PERFORMANCE_ORDER = " ORDER BY p.starts_at NULLS LAST, p.id";
    private final NamedParameterJdbcTemplate jdbc;

    public JdbcWorkspaceOperationsStore(JdbcTemplate jdbc) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    }

    @Override
    public Page<EventRow> events(EventFilters filters, Pageable page) {
        var args = new MapSqlParameterSource();
        String where = EVENT_ROWS + equals(args, "e.organization_id", "organization", filters.organizationId())
                + search(args, filters.query());
        if (filters.status() == EventStatus.PREPARING) {
            where += " AND (rollup.performance_count = 0 OR rollup.statuses && ARRAY['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'])";
        } else if (filters.status() == EventStatus.DRAFT) {
            where += " AND (rollup.performance_count = 0 OR 'DRAFT' = ANY(rollup.statuses))";
        } else if (filters.status() != null) {
            where += " AND :status = ANY(rollup.statuses)";
            args.addValue("status", filters.status().name());
        }
        return page(EVENT_COLUMNS, where, " ORDER BY e.created_at DESC, e.id", args, page, this::eventRow);
    }

    @Override
    public Optional<EventRow> event(UUID eventId) {
        return jdbc.query(EVENT_COLUMNS + EVENT_ROWS + " AND e.id = :eventId",
                new MapSqlParameterSource("eventId", eventId), this::eventRow).stream().findFirst();
    }

    @Override
    public List<PerformanceRow> eventPerformances(UUID eventId) {
        return jdbc.query(PERFORMANCE_COLUMNS + PERFORMANCE_ROWS + " AND e.id = :eventId" + PERFORMANCE_ORDER,
                new MapSqlParameterSource("eventId", eventId), this::performanceRow);
    }

    @Override
    public Page<PerformanceRow> performances(ReportFilters filters, Pageable page) {
        var args = new MapSqlParameterSource();
        String where = PERFORMANCE_ROWS
                + showScope(args, filters.organizationId(), filters.eventId(), filters.performanceId(), filters.concertId());
        if (filters.from() != null) {
            where += " AND p.starts_at >= :from";
            args.addValue("from", filters.from());
        }
        if (filters.to() != null) {
            where += " AND p.starts_at < :to";
            args.addValue("to", filters.to());
        }
        if (filters.status() == ReportStatus.ON_SALE_NOW) {
            where += """
                     AND p.status = 'ON_SALE' AND p.discoverable AND NOT p.sales_suspended
                     AND p.sale_start_at <= :asOf AND (p.sale_end_at IS NULL OR p.sale_end_at > :asOf)
                    """;
            args.addValue("asOf", filters.asOf());
        } else if (filters.status() == ReportStatus.UPCOMING) {
            where += " AND p.status NOT IN ('DRAFT', 'CANCELLED', 'COMPLETED')";
        } else if (filters.status() != null) {
            where += equals(args, "p.status", "status", filters.status().name());
        }
        return page(PERFORMANCE_COLUMNS, where, PERFORMANCE_ORDER, args, page, this::performanceRow);
    }

    @Override
    public Page<ReviewRow> reviews(ReviewFilters filters, Pageable page) {
        var args = new MapSqlParameterSource();
        String where = SHOWS + CURRENT_REVIEW + " WHERE " + REVIEW_STATE + " <> 'SUPERSEDED'"
                + showScope(args, filters.organizationId(), filters.eventId(), filters.performanceId(), filters.concertId())
                + search(args, filters.query());
        if (filters.status() != ReviewStatus.ALL) {
            where += equals(args, REVIEW_STATE, "status", filters.status().name());
        }
        return page(REVIEW_COLUMNS, where, " ORDER BY publish_at, id", args, page, this::reviewRow);
    }

    private <T> Page<T> page(String columns, String where, String order, MapSqlParameterSource args,
                             Pageable page, RowMapper<T> mapper) {
        long total = jdbc.queryForObject("SELECT count(*) " + where, args, Long.class);
        if (page.getOffset() >= total) {
            return new PageImpl<>(List.of(), page, total);
        }
        args.addValue("limit", page.getPageSize()).addValue("offset", page.getOffset());
        return new PageImpl<>(jdbc.query(columns + where + order + " LIMIT :limit OFFSET :offset", args, mapper),
                page, total);
    }

    private static String showScope(MapSqlParameterSource args, UUID organization, UUID event, UUID performance, UUID concert) {
        return equals(args, "e.organization_id", "organization", organization)
                + equals(args, "e.id", "event", event)
                + equals(args, "p.id", "performance", performance)
                + equals(args, "p.legacy_concert_id", "concert", concert);
    }

    private static String equals(MapSqlParameterSource args, String column, String parameter, Object value) {
        if (value == null) {
            return "";
        }
        args.addValue(parameter, value);
        return " AND " + column + " = :" + parameter;
    }

    private static String search(MapSqlParameterSource args, String query) {
        if (query == null) {
            return "";
        }
        args.addValue("query", query);
        return " AND (strpos(lower(e.title), lower(:query)) > 0 OR CAST(e.id AS text) = lower(:query))";
    }

    private EventRow eventRow(ResultSet row, int index) throws SQLException {
        return new EventRow(row.getObject("id", UUID.class), row.getString("title"), row.getString("description"),
                row.getString("segment_id"), row.getString("primary_genre_id"), row.getObject("organization_id", UUID.class),
                row.getObject("legacy_concert_id", UUID.class), row.getLong("performance_count"),
                row.getBoolean("preparing"), row.getBoolean("changes_requested"),
                row.getObject("next_starts_at", OffsetDateTime.class), row.getObject("action_performance_id", UUID.class),
                row.getString("change_reason"), row.getString("poster_url"), row.getString("status"),
                row.getBoolean("content_change_in_review"));
    }

    private PerformanceRow performanceRow(ResultSet row, int index) throws SQLException {
        return new PerformanceRow(row.getObject("id", UUID.class), row.getObject("event_id", UUID.class),
                row.getString("title"), row.getObject("organization_id", UUID.class),
                row.getObject("legacy_concert_id", UUID.class), row.getString("venue_name"), row.getString("space_name"),
                row.getObject("starts_at", OffsetDateTime.class), row.getObject("ends_at", OffsetDateTime.class),
                row.getString("timezone"), row.getString("status"), row.getBoolean("sales_suspended"),
                row.getBoolean("public_visible"), row.getObject("sale_start_at", OffsetDateTime.class),
                row.getObject("sale_end_at", OffsetDateTime.class), row.getString("publication_status"),
                row.getObject("ticketing_acknowledged", Boolean.class), row.getObject("checkin_acknowledged", Boolean.class));
    }

    private ReviewRow reviewRow(ResultSet row, int index) throws SQLException {
        UUID revision = row.getObject("id", UUID.class);
        UUID legacy = row.getObject("legacy_concert_id", UUID.class);
        return new ReviewRow(revision, revision, legacy == null ? ReviewModel.PERFORMANCE : ReviewModel.LEGACY,
                row.getObject("event_id", UUID.class), row.getObject("performance_id", UUID.class), legacy,
                row.getObject("organization_id", UUID.class), row.getString("title"),
                ReviewStatus.valueOf(row.getString("status")), row.getObject("submitted_at", OffsetDateTime.class),
                row.getObject("publish_at", OffsetDateTime.class), row.getString("reason"));
    }
}
