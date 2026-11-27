package org.ticketbox.catalog.performance.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.classification.domain.EventClassification;
import org.ticketbox.catalog.performance.application.DiscoveryQuery;
import org.ticketbox.catalog.performance.application.PerformanceStore;
import org.ticketbox.catalog.performance.application.PerformanceViews.*;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

@Repository
public class JdbcPerformanceStore implements PerformanceStore {
    private static final TypeReference<List<PerformanceLayout.Point>> POINTS = new TypeReference<>() {};
    private static final TypeReference<List<PerformanceLayout.Shape>> SHAPES = new TypeReference<>() {};
    private static final TypeReference<List<Space>> SPACES = new TypeReference<>() {};
    private static final TypeReference<Map<String, DiscoveryText>> TRANSLATIONS = new TypeReference<>() {};
    private static final String EVENT_SELECT = """
            SELECT e.id,e.title,e.description,ev.segment_id,ev.primary_genre_id,e.draft_version,ev.content_version,
                   COALESCE(ev.poster_url, c.poster_url) AS poster_url,
                   COALESCE(CAST(ev.localized_content AS jsonb), CAST(c.localized_content AS jsonb))->'translations' AS translations,
                   COALESCE(ev.artist_bio, c.artist_bio) AS artist_bio, ev.age_rating, ev.refund_policy
            FROM catalog_event_view e JOIN events ev ON ev.id=e.id LEFT JOIN concerts c ON c.id=e.legacy_concert_id
            """;
    private static final String PUBLIC_EVENT = """
            EXISTS (SELECT 1 FROM catalog_performance_view p WHERE p.event_id = e.id AND p.discoverable)
            """;

    // Best-effort city: the last comma-separated part of the venue address, without a trailing country.
    private static final String CITY = """
            CASE WHEN position(',' IN p.venue_address) > 0 THEN NULLIF(btrim(substring(
                regexp_replace(p.venue_address, '\\s*,\\s*vi.t\\s*nam\\s*$', '', 'i') FROM '([^,]+)$')), '') END
            """;
    private static final String MIN_PRICE = """
            COALESCE((SELECT min(o.price) FROM performance_sale_offers o WHERE o.performance_id=p.id AND o.active),
                     (SELECT min(t.price) FROM ticket_types t WHERE t.concert_id=p.legacy_concert_id AND t.is_active))
            """;
    private static final String CONTENT = """
            COALESCE(CAST(ev.localized_content AS jsonb), CAST(c.localized_content AS jsonb))
            """;
    private static final String DISCOVERY = """
            WITH base AS (
                SELECT e.id AS catalog_event_id, COALESCE(p.legacy_concert_id, p.id) AS id,
                       CASE WHEN p.legacy_concert_id IS NULL THEN e.id END AS event_id,
                       e.title, p.venue_name, p.starts_at AS event_date, p.sale_start_at, p.sale_end_at,
                       p.status, p.sales_suspended, COALESCE(ev.poster_url, c.poster_url) AS poster_url,
                       ev.segment_id, ev.primary_genre_id, {city} AS city, {minPrice} AS min_price,
                       {content}->'translations' AS translations,
                       CASE WHEN :saleStartFirst THEN p.sale_start_at ELSE p.starts_at END AS sort_date
                FROM catalog_event_view e JOIN catalog_performance_view p ON p.event_id=e.id
                JOIN events ev ON ev.id=e.id
                LEFT JOIN concerts c ON c.id=p.legacy_concert_id
                WHERE p.discoverable
                  AND (CAST(:startsFrom AS timestamptz) IS NULL OR p.starts_at >= :startsFrom)
                  AND (CAST(:startsBefore AS timestamptz) IS NULL OR p.starts_at < :startsBefore)
                  AND (CAST(:segment AS text) IS NULL OR ev.segment_id = :segment)
                  AND (CAST(:genre AS text) IS NULL OR ev.primary_genre_id = :genre OR EXISTS (
                      SELECT 1 FROM event_genres tag WHERE tag.event_id = e.id AND tag.genre_id = :genre))
                  AND (CAST(:saleStatus AS text) IS NULL OR :saleStatus = CASE
                      WHEN p.status='CANCELLED' THEN 'CANCELLED'
                      WHEN p.legacy_concert_id IS NULL AND p.sales_suspended THEN 'CLOSED'
                      WHEN p.status='COMPLETED' OR p.sale_end_at <= :now THEN 'CLOSED'
                      WHEN p.status='SOLD_OUT' THEN 'SOLD_OUT'
                      WHEN p.status<>'ON_SALE' OR p.sale_start_at IS NULL OR p.sale_start_at > :now THEN 'UPCOMING'
                      ELSE 'ON_SALE'
                  END)
                  AND (:words = '' OR NOT EXISTS (
                      SELECT 1 FROM regexp_split_to_table(:words, ' ') AS search(word)
                      WHERE strpos(replace(regexp_replace(lower(normalize(concat_ws(' ', e.title, p.venue_name,
                          (SELECT string_agg(translation.value->>'title', ' ')
                           FROM jsonb_each({content}->'translations') AS translation)), NFD)),
                           U&'[\\0300-\\036f]', '', 'g'), U&'\\0111', 'd'), search.word) = 0
                  ))
            ), matching AS (
                SELECT * FROM base
                WHERE (CAST(:city AS text) IS NULL OR lower(city) = lower(:city))
                  AND (CAST(:minPrice AS numeric) IS NULL OR min_price >= :minPrice)
                  AND (CAST(:maxPrice AS numeric) IS NULL OR min_price <= :maxPrice)
            ), representatives AS (
                SELECT DISTINCT ON (catalog_event_id) *,
                       count(*) OVER (PARTITION BY catalog_event_id) AS performance_count,
                       min(min_price) OVER (PARTITION BY catalog_event_id) AS event_min_price
                FROM matching
                ORDER BY catalog_event_id, sort_date, event_date, id
            ), card_page AS (
                SELECT * FROM representatives ORDER BY sort_date, event_date, id LIMIT :size OFFSET :offset
            )
            SELECT total.total_elements, card_page.*
            FROM (SELECT count(*) AS total_elements FROM representatives) total
            LEFT JOIN card_page ON TRUE
            ORDER BY card_page.sort_date, card_page.event_date, card_page.id
            """.replace("{city}", CITY).replace("{minPrice}", MIN_PRICE).replace("{content}", CONTENT);

    private static final String FACET_CITIES = """
            SELECT DISTINCT {city} AS city
            FROM catalog_event_view e JOIN catalog_performance_view p ON p.event_id=e.id
            WHERE p.discoverable AND p.starts_at >= now()
            """.replace("{city}", CITY);
    private static final String FACET_SEGMENTS = """
            SELECT s.id, count(*) AS events FROM (
                SELECT DISTINCT e.id AS event_id FROM catalog_event_view e
                JOIN catalog_performance_view p ON p.event_id=e.id WHERE p.discoverable AND p.starts_at >= now()
            ) upcoming JOIN events ev ON ev.id=upcoming.event_id
            JOIN classification_segments s ON s.id=ev.segment_id
            GROUP BY s.id, s.sort ORDER BY s.sort
            """;
    // A genre counts an event once, whether it is the primary genre or a tag.
    // With a segment, only events of that segment count, so cross-segment tags on them are offered too.
    private static final String FACET_GENRES = """
            WITH upcoming AS (
                SELECT DISTINCT e.id AS event_id FROM catalog_event_view e
                JOIN catalog_performance_view p ON p.event_id=e.id
                JOIN events ev ON ev.id=e.id
                WHERE p.discoverable AND p.starts_at >= now()
                  AND (CAST(:segment AS text) IS NULL OR ev.segment_id = :segment)
            ), uses AS (
                SELECT u.event_id, ev.primary_genre_id AS genre_id FROM upcoming u JOIN events ev ON ev.id=u.event_id
                WHERE ev.primary_genre_id IS NOT NULL
                UNION
                SELECT u.event_id, g.genre_id FROM upcoming u JOIN event_genres g ON g.event_id=u.event_id
            )
            SELECT g.id, g.segment_id, count(*) AS events FROM uses JOIN classification_genres g ON g.id=uses.genre_id
            JOIN classification_segments s ON s.id=g.segment_id
            GROUP BY g.id, g.segment_id, s.sort, g.sort ORDER BY s.sort, g.sort
            """;

    private static final String OPERATIONS_SHOWS = """
            FROM performances p JOIN events e ON e.id=p.event_id
            JOIN venue_spaces s ON s.id=p.venue_space_id JOIN venues v ON v.id=s.venue_id
            """;
    private static final String OPERATIONS_ELIGIBLE = """
            WHERE p.legacy_concert_id IS NULL AND e.legacy_concert_id IS NULL
              AND p.status <> 'DRAFT'
            """;
    private static final String OPERATIONS_FIELDS = """
            SELECT p.id,e.title,v.name AS venue_name,s.name AS space_name,p.starts_at,p.ends_at,
                   p.doors_open_at,p.timezone,p.sale_start_at,p.sale_end_at,p.status,p.sales_suspended,
                   COALESCE(pub.ticketing_ack,false) AS ticketing_ack,COALESCE(pub.checkin_ack,false) AS checkin_ack
            """;
    private static final String OPERATIONS_ACK = """
            LEFT JOIN performance_sale_publications pub ON pub.performance_id=p.id AND pub.version=p.sale_version
            """;

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final ObjectMapper json;

    public JdbcPerformanceStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.json = json;
    }

    @Override
    public Page<Event> events(UUID organizer, Pageable page) {
        var where = organizer == null ? PUBLIC_EVENT : "e.organization_id = :organizer";
        var params = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                .addValue("organizer", organizer).addValue("limit", page.getPageSize()).addValue("offset", page.getOffset());
        long total = named.queryForObject(
                "SELECT count(*) FROM catalog_event_view e WHERE " + where, params, Long.class);
        var rows = named.query(EVENT_SELECT + """
                WHERE %s ORDER BY e.created_at DESC,e.id LIMIT :limit OFFSET :offset
                """.formatted(where), params, (rs, n) -> readEvent(rs));
        return new PageImpl<>(withPerformances(rows, organizer == null), page, total);
    }

    @Override
    public Page<DiscoveryCard> discover(DiscoveryQuery query, Pageable page) {
        var parameters = new MapSqlParameterSource()
                .addValue("words", query.words())
                .addValue("now", query.now())
                .addValue("startsFrom", query.startsFrom())
                .addValue("startsBefore", query.startsBefore())
                .addValue("saleStatus", query.status() == null ? null : query.status().name())
                .addValue("saleStartFirst", query.saleStartFirst())
                .addValue("city", query.city())
                .addValue("segment", query.segment())
                .addValue("genre", query.genre())
                .addValue("minPrice", query.minPrice())
                .addValue("maxPrice", query.maxPrice())
                .addValue("size", page.getPageSize())
                .addValue("offset", page.getOffset());
        return named.query(DISCOVERY, parameters, rows -> {
            long total = 0;
            var cards = new ArrayList<DiscoveryCard>(page.getPageSize());
            while (rows.next()) {
                total = rows.getLong("total_elements");
                var id = id(rows, "id");
                if (id == null) continue;
                var translations = rows.getString("translations");
                cards.add(new DiscoveryCard(id, id(rows, "event_id"), rows.getString("title"),
                        rows.getString("venue_name"), time(rows, "event_date"), time(rows, "sale_start_at"),
                        time(rows, "sale_end_at"), rows.getString("status"), rows.getString("poster_url"),
                        rows.getBoolean("sales_suspended"), translations == null ? Map.of() : read(translations, TRANSLATIONS),
                        rows.getBigDecimal("event_min_price") == null ? null : rows.getBigDecimal("event_min_price").longValue(),
                        rows.getString("city"), rows.getString("segment_id"), rows.getString("primary_genre_id"),
                        rows.getInt("performance_count")));
            }
            return new PageImpl<>(cards, page, total);
        });
    }

    @Override
    public DiscoveryFacets discoveryFacets(String segment) {
        var cities = new java.util.TreeSet<String>();
        jdbc.query(FACET_CITIES, rows -> {
            if (rows.getString("city") != null) cities.add(rows.getString("city"));
        });
        var segments = jdbc.query(FACET_SEGMENTS, (rs, n) -> new SegmentCount(rs.getString("id"), rs.getInt("events")));
        var genres = named.query(FACET_GENRES, new MapSqlParameterSource().addValue("segment", segment),
                (rs, n) -> new GenreCount(rs.getString("id"), rs.getString("segment_id"), rs.getInt("events")));
        return new DiscoveryFacets(List.copyOf(cities), segments, genres, segments.stream().map(SegmentCount::id).toList());
    }

    @Override
    public Optional<Event> event(UUID id, UUID organizer) {
        var where = organizer == null ? PUBLIC_EVENT : "e.organization_id = :organizer";
        var params = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                .addValue("id", id).addValue("organizer", organizer);
        var rows = named.query(EVENT_SELECT + " WHERE e.id=:id AND " + where, params, (rs, n) -> readEvent(rs));
        return withPerformances(rows, organizer == null).stream().findFirst();
    }

    @Override
    public Optional<Event> previewEvent(UUID id, UUID organizer) {
        var params = new MapSqlParameterSource().addValue("id", id).addValue("organizer", organizer);
        var rows = named.query(EVENT_SELECT + " WHERE e.id=:id AND (CAST(:organizer AS uuid) IS NULL OR e.organization_id=:organizer)",
                params, (rs, n) -> readEvent(rs));
        return withPerformances(rows, false).stream().findFirst();
    }

    private Event readEvent(ResultSet rs) throws SQLException {
        var translations = rs.getString("translations");
        return new Event(id(rs, "id"), rs.getString("title"), rs.getString("description"),
                rs.getString("segment_id"), rs.getString("primary_genre_id"), List.of(), rs.getLong("draft_version"), rs.getLong("content_version"), List.of(), rs.getString("poster_url"),
                translations == null ? Map.of() : read(translations, TRANSLATIONS), rs.getString("artist_bio"),
                rs.getString("age_rating"), rs.getString("refund_policy"));
    }

    private List<Event> withPerformances(List<Event> events, boolean publicOnly) {
        if (events.isEmpty()) return events;
        var tags = new HashMap<UUID, List<String>>();
        named.query("SELECT event_id, genre_id FROM event_genres WHERE event_id IN (:ids) ORDER BY sort, genre_id",
                Map.of("ids", events.stream().map(Event::id).toList()), rs -> {
                    tags.computeIfAbsent(rs.getObject("event_id", UUID.class), key -> new ArrayList<>())
                            .add(rs.getString("genre_id"));
                });
        events = events.stream().map(event -> event.withGenres(tags.getOrDefault(event.id(), List.of()))).toList();
        var performances = named.query("""
                SELECT * FROM catalog_performance_view WHERE event_id IN (:ids)
                """ + (publicOnly ? " AND discoverable" : "") + " ORDER BY starts_at,id",
                Map.of("ids", events.stream().map(Event::id).toList()), this::performance)
                .stream().collect(Collectors.groupingBy(Performance::eventId));
        return events.stream().map(event -> event.withPerformances(performances.getOrDefault(event.id(), List.of()))).toList();
    }

    @Override
    public boolean ownsNativeEvent(UUID id, UUID organizer) {
        return jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM events WHERE id=? AND organization_id=? AND legacy_concert_id IS NULL)",
                Boolean.class, id, organizer);
    }

    @Override
    public Optional<Long> lockNativeEventVersion(UUID id, UUID organizer) {
        return first("""
                SELECT draft_version FROM events
                WHERE id=? AND organization_id=? AND legacy_concert_id IS NULL FOR NO KEY UPDATE
                """, (rs, n) -> rs.getLong("draft_version"), id, organizer);
    }

    @Override
    public boolean hasReleasedPerformances(UUID event) {
        return jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM performances WHERE event_id=? AND status<>'DRAFT')
                """, Boolean.class, event);
    }

    @Override
    public boolean hasPublicationReview(UUID performance) {
        return jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM performance_publication_reviews WHERE performance_id=? AND state='RELEASED')
                """, Boolean.class, performance);
    }

    @Override
    public void createEvent(UUID id, UUID organizer, String title, String description) {
        jdbc.update("INSERT INTO events(id,organization_id,title,description) VALUES(?,?,?,?)",
                id, organizer, title, description);
    }

    @Override
    public void updateDraftEvent(UUID id, String title, String description) {
        jdbc.update("""
                UPDATE events SET title=?,description=?,draft_version=draft_version+1 WHERE id=?
                """, title, description, id);
    }

    @Override
    public void writeClassification(UUID eventId, EventClassification classification) {
        jdbc.update("UPDATE events SET segment_id=?, primary_genre_id=? WHERE id=?",
                classification == null ? null : classification.segment(),
                classification == null ? null : classification.primaryGenre(), eventId);
        jdbc.update("DELETE FROM event_genres WHERE event_id=?", eventId);
        if (classification == null) return;
        short sort = 0;
        for (String genre : classification.secondaryGenres()) {
            jdbc.update("INSERT INTO event_genres(event_id, genre_id, sort) VALUES (?,?,?)", eventId, genre, sort++);
        }
    }

    @Override
    public EventClassification classification(UUID eventId) {
        var row = jdbc.query("SELECT segment_id, primary_genre_id FROM events WHERE id=?",
                (rs, n) -> new String[] {rs.getString("segment_id"), rs.getString("primary_genre_id")}, eventId)
                .stream().findFirst().orElse(null);
        if (row == null || row[0] == null) return null;
        var tags = jdbc.queryForList("SELECT genre_id FROM event_genres WHERE event_id=? ORDER BY sort, genre_id",
                String.class, eventId);
        return new EventClassification(row[0], row[1], tags);
    }

    @Override
    public Optional<ConcertCategory> legacyEventCategory(UUID concert, UUID organizer) {
        return jdbc.query("""
                SELECT e.segment_id FROM events e JOIN concerts c ON c.id=e.legacy_concert_id
                WHERE e.legacy_concert_id=? AND (?::uuid IS NULL OR c.organization_id=?)
                """, (rs, row) -> new ConcertCategory(rs.getString("segment_id")), concert, organizer, organizer)
                .stream().findFirst();
    }

    @Override
    public Optional<UUID> legacyEventId(UUID concert, UUID organizer) {
        return jdbc.queryForList("""
                SELECT e.id FROM events e JOIN concerts c ON c.id=e.legacy_concert_id
                WHERE e.legacy_concert_id=? AND (?::uuid IS NULL OR c.organization_id=?)
                """, UUID.class, concert, organizer, organizer).stream().findFirst();
    }

    @Override
    public void bumpContentVersion(UUID eventId) {
        jdbc.update("UPDATE events SET content_version=content_version+1 WHERE id=?", eventId);
    }

    @Override
    public List<Venue> venues(UUID organizer) {
        return jdbc.query(venueSelect() + " WHERE v.organization_id=? ORDER BY v.name,v.id LIMIT 500",
                this::venue, organizer);
    }

    @Override
    public Optional<Venue> venue(UUID id, UUID organizer) {
        return first(venueSelect() + " WHERE v.id=? AND v.organization_id=?", this::venue, id, organizer);
    }

    private static String venueSelect() {
        return """
                SELECT v.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name,s.id)
                  FROM venue_spaces s WHERE s.venue_id=v.id),'[]'::jsonb) AS spaces FROM venues v
                """;
    }

    private Venue venue(ResultSet rs, int n) throws SQLException {
        return new Venue(id(rs, "id"), rs.getString("name"), rs.getString("address"),
                read(rs.getString("spaces"), SPACES));
    }

    @Override
    public boolean ownsSpace(UUID id, UUID organizer) {
        return jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM venue_spaces s JOIN venues v ON v.id=s.venue_id
                  WHERE s.id=? AND v.organization_id=?)
                """, Boolean.class, id, organizer);
    }

    @Override
    public void createVenue(UUID id, UUID space, UUID organizer, String name, String address, String spaceName) {
        jdbc.update("INSERT INTO venues(id,organization_id,name,address) VALUES(?,?,?,?)", id, organizer, name, address);
        jdbc.update("INSERT INTO venue_spaces(id,venue_id,name) VALUES(?,?,?)", space, id, spaceName);
    }

    @Override
    public Performance createPerformance(
            UUID id, UUID event, UUID space, OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors,
            String timezone, OffsetDateTime saleStart, OffsetDateTime saleEnd, int limit, boolean isPublic) {
        jdbc.update("""
                INSERT INTO performances(id,event_id,venue_space_id,starts_at,ends_at,doors_open_at,timezone,
                  sale_start_at,sale_end_at,max_per_account,public_visible) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """, id, event, space, starts, ends, doors, timezone, saleStart, saleEnd, limit, isPublic);
        return performanceView(id).orElseThrow();
    }

    @Override
    public Performance updateDraftSchedule(
            UUID id, UUID space, OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors,
            String timezone, OffsetDateTime saleStart, OffsetDateTime saleEnd, int limit, boolean isPublic) {
        jdbc.update("""
                UPDATE performances SET venue_space_id=?, starts_at=?, ends_at=?, doors_open_at=?, timezone=?,
                  sale_start_at=?, sale_end_at=?, max_per_account=?, public_visible=?, draft_version=draft_version+1
                WHERE id=?
                """, space, starts, ends, doors, timezone, saleStart, saleEnd, limit, isPublic, id);
        return performanceView(id).orElseThrow();
    }

    @Override
    public Optional<Performance> lockOwnedPerformance(UUID id, UUID organizer) {
        // Read the view after acquiring the lock so it includes the preceding owner's commit.
        return first("""
                SELECT p.id FROM performances p JOIN events e ON e.id=p.event_id
                WHERE p.id=? AND e.organization_id=? AND p.legacy_concert_id IS NULL FOR UPDATE OF p
                """, (rs, n) -> id(rs, "id"), id, organizer).flatMap(this::performanceView);
    }

    @Override
    public Optional<Performance> lockNativePerformance(UUID id) {
        return first("""
                SELECT v.* FROM performances p JOIN catalog_performance_view v ON v.id=p.id
                WHERE p.id=? AND p.legacy_concert_id IS NULL FOR UPDATE OF p
                """, this::performance, id);
    }

    @Override
    public Optional<UUID> nativeOwner(UUID id) {
        return first("""
                SELECT e.organization_id FROM performances p JOIN events e ON e.id=p.event_id
                WHERE p.id=? AND p.legacy_concert_id IS NULL
                """, (rs, n) -> id(rs, "organization_id"), id);
    }

    @Override
    public Optional<Performance> publicPerformance(UUID id) {
        return first("SELECT * FROM catalog_performance_view WHERE id=? AND discoverable", this::performance, id);
    }

    @Override
    public Page<OperationsPerformance> operationsPerformances(String query, Pageable page) {
        String search = query.isEmpty() ? "" : """
                AND strpos(lower(concat_ws(' ',e.title,v.name,s.name,p.id::text)),lower(:query)) > 0
                """;
        var params = Map.of("query", query, "limit", page.getPageSize(), "offset", page.getOffset());
        long total = named.queryForObject(
                "SELECT count(*) " + OPERATIONS_SHOWS + OPERATIONS_ELIGIBLE + search, params, Long.class);
        var rows = named.query(OPERATIONS_FIELDS + OPERATIONS_SHOWS + OPERATIONS_ACK + OPERATIONS_ELIGIBLE + search + """
                ORDER BY CASE WHEN p.ends_at >= CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
                  CASE WHEN p.ends_at >= CURRENT_TIMESTAMP THEN p.starts_at END ASC, p.starts_at DESC, p.id
                LIMIT :limit OFFSET :offset
                """, params, this::readOperationsPerformance);
        return new PageImpl<>(rows, page, total);
    }

    @Override
    public Optional<OperationsPerformance> operationsPerformance(UUID id) {
        return first(OPERATIONS_FIELDS + OPERATIONS_SHOWS + OPERATIONS_ACK + OPERATIONS_ELIGIBLE + "AND p.id=?",
                this::readOperationsPerformance, id);
    }

    private OperationsPerformance readOperationsPerformance(ResultSet rs, int n) throws SQLException {
        return new OperationsPerformance(id(rs, "id"), rs.getString("title"), rs.getString("venue_name"),
                rs.getString("space_name"), time(rs, "starts_at"), time(rs, "ends_at"), time(rs, "doors_open_at"),
                rs.getString("timezone"), time(rs, "sale_start_at"), time(rs, "sale_end_at"), rs.getString("status"),
                rs.getBoolean("sales_suspended"), rs.getBoolean("ticketing_ack"), rs.getBoolean("checkin_ack"));
    }

    private Optional<Performance> performanceView(UUID id) {
        return first("SELECT * FROM catalog_performance_view WHERE id=?", this::performance, id);
    }

    private Performance performance(ResultSet rs, int n) throws SQLException {
        return new Performance(id(rs, "id"), id(rs, "event_id"), id(rs, "venue_space_id"),
                rs.getString("venue_name"), rs.getString("venue_address"), rs.getString("space_name"),
                time(rs, "starts_at"), time(rs, "ends_at"), time(rs, "doors_open_at"), rs.getString("timezone"),
                time(rs, "sale_start_at"), time(rs, "sale_end_at"), rs.getString("status"),
                rs.getBoolean("sales_suspended"), time(rs, "resumed_admission_at"), rs.getBoolean("public_visible"), rs.getInt("max_per_account"),
                rs.getLong("sale_version"), rs.getObject("layout_version", Long.class), id(rs, "legacy_concert_id"),
                rs.getLong("draft_version"));
    }

    @Override
    public PerformanceSale sale(UUID id) {
        var seatsByGroup = new java.util.HashMap<UUID, List<PerformanceSale.Seat>>();
        jdbc.query("""
                SELECT group_id,id,row_label,seat_label,blocked FROM performance_sale_group_seats
                WHERE performance_id=? ORDER BY group_id,sort_index
                """, (org.springframework.jdbc.core.RowCallbackHandler) row ->
                seatsByGroup.computeIfAbsent(id(row, "group_id"), unused -> new ArrayList<>())
                        .add(new PerformanceSale.Seat(id(row, "id"), row.getString("row_label"),
                                row.getString("seat_label"), row.getBoolean("blocked"))), id);
        var groups = jdbc.query("""
                SELECT id,section_id,section_label,kind,capacity FROM performance_sale_groups
                WHERE performance_id=? ORDER BY sort_index
                """, (row, index) -> new PerformanceSale.Group(id(row, "id"), id(row, "section_id"),
                row.getString("section_label"), PerformanceLayout.Kind.valueOf(row.getString("kind")),
                row.getInt("capacity"), seatsByGroup.getOrDefault(id(row, "id"), List.of())), id);
        var offers = jdbc.query("""
                SELECT id,group_id,name,price,currency,sale_start_at,sale_end_at,active,description,min_per_order
                FROM performance_sale_offers WHERE performance_id=? ORDER BY sort_index
                """, (row, index) -> new PerformanceSale.Offer(id(row, "id"), id(row, "group_id"),
                row.getString("name"), row.getBigDecimal("price"), row.getString("currency"),
                time(row, "sale_start_at"), time(row, "sale_end_at"), row.getBoolean("active"),
                row.getString("description"), row.getInt("min_per_order")), id);
        return new PerformanceSale(groups, offers);
    }

    @Override
    public void saveSale(UUID id, long version, PerformanceSale sale) {
        jdbc.update("UPDATE performances SET sale_version=? WHERE id=?", version, id);
        jdbc.update("DELETE FROM performance_sale_groups WHERE performance_id=?", id);
        for (int position = 0; position < sale.groups().size(); position++) {
            var group = sale.groups().get(position);
            jdbc.update("""
                    INSERT INTO performance_sale_groups(
                        performance_id,id,section_id,section_label,kind,capacity,sort_index)
                    VALUES (?,?,?,?,?,?,?)
                    """, id, group.id(), group.sectionId(), group.sectionLabel(), group.kind().name(),
                    group.capacity(), position);
            List<Object[]> seats = new ArrayList<>(group.seats().size());
            for (int seatPosition = 0; seatPosition < group.seats().size(); seatPosition++) {
                var seat = group.seats().get(seatPosition);
                seats.add(new Object[] {id, group.id(), seat.id(), seat.rowLabel(), seat.seatLabel(),
                        seat.blocked(), seatPosition});
            }
            jdbc.batchUpdate("""
                    INSERT INTO performance_sale_group_seats(
                        performance_id,group_id,id,row_label,seat_label,blocked,sort_index)
                    VALUES (?,?,?,?,?,?,?)
                    """, seats);
        }
        List<Object[]> offers = new ArrayList<>(sale.offers().size());
        for (int position = 0; position < sale.offers().size(); position++) {
            var offer = sale.offers().get(position);
            offers.add(new Object[] {id, offer.id(), offer.groupId(), offer.name(), offer.price(), offer.currency(),
                    offer.saleStartAt(), offer.saleEndAt(), offer.active(), position, offer.description(),
                    offer.minPerOrder()});
        }
        jdbc.batchUpdate("""
                INSERT INTO performance_sale_offers(
                    performance_id,id,group_id,name,price,currency,sale_start_at,sale_end_at,active,sort_index,
                    description,min_per_order)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """, offers);
    }

    @Override
    public Optional<Layout> draftLayout(UUID id) {
        return first("SELECT version,document FROM performance_layout_drafts WHERE performance_id=?",
                (rs, n) -> new Layout(rs.getLong("version"), read(rs.getString("document"), PerformanceLayout.class)), id);
    }

    @Override
    public void saveDraftLayout(UUID id, long version, PerformanceLayout layout) {
        jdbc.update("""
                INSERT INTO performance_layout_drafts(performance_id,version,document) VALUES (?,?,CAST(? AS JSONB))
                ON CONFLICT (performance_id) DO UPDATE SET version=excluded.version, document=excluded.document
                """, id, version, write(layout));
    }

    @Override
    public String freezeLayout(UUID id, Layout draft) {
        var layout = draft.layout();
        long revision = draft.version();
        String checksum = checksum(layout);
        UUID background = backgroundId(layout.backgroundUrl());
        jdbc.update("""
                INSERT INTO performance_layouts(performance_id,version,width,height,background_id,shapes,checksum)
                VALUES (?,?,?,?,?,CAST(? AS JSONB),?)
                """, id, revision, layout.width(), layout.height(), background, write(layout.shapes()), checksum);

        List<Object[]> sections = new ArrayList<>();
        List<Object[]> rows = new ArrayList<>();
        List<Object[]> seats = new ArrayList<>();
        for (int sectionIndex = 0; sectionIndex < layout.sections().size(); sectionIndex++) {
            var section = layout.sections().get(sectionIndex);
            sections.add(new Object[] {id, revision, section.id(), section.code(), section.label(),
                    section.kind().name(), write(section.points()), sectionIndex});
            for (int rowIndex = 0; rowIndex < section.rows().size(); rowIndex++) {
                var row = section.rows().get(rowIndex);
                rows.add(new Object[] {id, revision, section.id(), row.id(), row.code(), row.label(), rowIndex});
                for (int seatIndex = 0; seatIndex < row.seats().size(); seatIndex++) {
                    var seat = row.seats().get(seatIndex);
                    seats.add(new Object[] {id, revision, section.id(), row.id(), seat.id(), seat.label(), seat.x(),
                            seat.y(), seat.accessible(), seat.restrictedView(), seat.segment(), seat.position(),
                            seat.blocked(), seatIndex});
                }
            }
        }
        jdbc.batchUpdate("""
                INSERT INTO layout_sections(performance_id,version,id,code,label,kind,points,sort_index)
                VALUES (?,?,?,?,?,?,CAST(? AS JSONB),?)
                """, sections);
        jdbc.batchUpdate("""
                INSERT INTO layout_rows(performance_id,version,section_id,id,code,label,sort_index)
                VALUES (?,?,?,?,?,?,?)
                """, rows);
        jdbc.batchUpdate("""
                INSERT INTO layout_seats(performance_id,version,section_id,row_id,id,label,x,y,accessible,
                  restricted_view,segment,position,blocked,sort_index) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, seats);
        return checksum;
    }

    @Override
    public String layoutChecksum(UUID id, long version) {
        return jdbc.queryForObject(
                "SELECT checksum FROM performance_layouts WHERE performance_id=? AND version=?", String.class, id, version);
    }

    @Override
    public Optional<LayoutOverview> layoutOverview(UUID id, long revision) {
        var header = first("""
                SELECT width,height,background_id,shapes FROM performance_layouts WHERE performance_id=? AND version=?
                """, (rs, n) -> new LayoutOverview(revision, rs.getDouble("width"), rs.getDouble("height"),
                publicBackgroundUrl(id, revision, id(rs, "background_id")), read(rs.getString("shapes"), SHAPES),
                List.of()), id, revision);
        return header.map(value -> new LayoutOverview(value.version(), value.width(), value.height(),
                value.backgroundUrl(), value.shapes(), jdbc.query("""
                SELECT id,code,label,kind,points FROM layout_sections
                WHERE performance_id=? AND version=? ORDER BY sort_index
                """, this::section, id, revision)));
    }

    @Override
    public Optional<LayoutSection> layoutSection(UUID id, long revision, UUID section) {
        var header = first("""
                SELECT id,code,label,kind,points FROM layout_sections WHERE performance_id=? AND version=? AND id=?
                """, this::section, id, revision, section);
        if (header.isEmpty()) return Optional.empty();
        Map<UUID, PerformanceLayout.Row> rows = new LinkedHashMap<>();
        jdbc.query("""
                SELECT r.id AS row_id,r.code AS row_code,r.label AS row_label,s.id AS seat_id,
                  s.label AS seat_label,s.x,s.y,s.accessible,s.restricted_view,s.segment,s.position,s.blocked
                FROM layout_rows r LEFT JOIN layout_seats s ON s.performance_id=r.performance_id
                  AND s.version=r.version AND s.section_id=r.section_id AND s.row_id=r.id
                WHERE r.performance_id=? AND r.version=? AND r.section_id=? ORDER BY r.sort_index,s.sort_index
                """, rs -> {
            UUID rowId = id(rs, "row_id");
            var row = rows.get(rowId);
            if (row == null) {
                row = new PerformanceLayout.Row(rowId, rs.getString("row_code"), rs.getString("row_label"),
                        new ArrayList<>());
                rows.put(rowId, row);
            }
            if (id(rs, "seat_id") != null) {
                row.seats().add(new PerformanceLayout.Seat(id(rs, "seat_id"), rs.getString("seat_label"),
                        rs.getDouble("x"), rs.getDouble("y"), rs.getBoolean("accessible"),
                        rs.getBoolean("restricted_view"), rs.getString("segment"),
                        rs.getObject("position", Integer.class), rs.getBoolean("blocked")));
            }
        }, id, revision, section);
        var shape = header.orElseThrow();
        return Optional.of(new LayoutSection(revision, new PerformanceLayout.Section(
                shape.id(), shape.code(), shape.label(), shape.kind(), shape.points(), List.copyOf(rows.values()))));
    }

    private PerformanceLayout.SectionSummary section(ResultSet rs, int n) throws SQLException {
        return new PerformanceLayout.SectionSummary(id(rs, "id"), rs.getString("code"), rs.getString("label"),
                PerformanceLayout.Kind.valueOf(rs.getString("kind")), read(rs.getString("points"), POINTS));
    }

    @Override
    public List<Template> templates(UUID venue, UUID organizer) {
        return jdbc.query("""
                SELECT t.id,t.venue_space_id,t.name,t.version, NULL AS document
                FROM layout_templates t JOIN venue_spaces s ON s.id=t.venue_space_id
                WHERE s.venue_id=? AND (t.organization_id=? OR t.organization_id IS NULL) ORDER BY t.name,t.id LIMIT 500
                """, this::template, venue, organizer);
    }

    @Override
    public Optional<Template> template(UUID id, UUID space, UUID organizer, long revision) {
        return first("""
                SELECT t.id,t.venue_space_id,t.name,r.version,r.document FROM layout_templates t
                JOIN layout_revisions r ON r.template_id=t.id
                WHERE t.id=? AND t.venue_space_id=? AND (t.organization_id=? OR t.organization_id IS NULL)
                AND r.version=?
                """, this::template, id, space, organizer, revision);
    }

    @Override
    public Optional<Template> lockTemplate(UUID id, UUID venue, UUID organizer) {
        return first("""
                SELECT t.id,t.venue_space_id,t.name,t.version,r.document FROM layout_templates t
                JOIN layout_revisions r ON r.template_id=t.id AND r.version=t.version
                JOIN venue_spaces s ON s.id=t.venue_space_id
                WHERE t.id=? AND s.venue_id=? AND t.organization_id=? FOR UPDATE OF t
                """, this::template, id, venue, organizer);
    }

    @Override
    public Template createTemplate(UUID id, UUID organizer, UUID space, String name, PerformanceLayout layout) {
        jdbc.update("INSERT INTO layout_templates(id,organization_id,venue_space_id,name,version) VALUES (?,?,?,?,1)",
                id, organizer, space, name);
        return insertTemplateRevision(id, space, name, 1, layout);
    }

    @Override
    public Template saveTemplate(Template current, PerformanceLayout layout) {
        long revision = current.revision() + 1;
        jdbc.update("UPDATE layout_templates SET version=? WHERE id=?", revision, current.id());
        return insertTemplateRevision(current.id(), current.venueSpaceId(), current.name(), revision, layout);
    }

    private Template insertTemplateRevision(UUID id, UUID space, String name, long revision, PerformanceLayout layout) {
        jdbc.update("""
                INSERT INTO layout_revisions(template_id,version,document) VALUES (?,?,CAST(? AS JSONB))
                """, id, revision, write(layout));
        return new Template(id, space, name, revision, layout);
    }

    private Template template(ResultSet rs, int n) throws SQLException {
        String document = rs.getString("document");
        return new Template(id(rs, "id"), id(rs, "venue_space_id"), rs.getString("name"), rs.getLong("version"),
                document == null ? null : read(document, PerformanceLayout.class));
    }

    @Override
    public void storeBackground(UUID id, UUID owner, UUID performance, Background image) {
        jdbc.update("""
                INSERT INTO layout_backgrounds(id,organization_id,source_performance_id,content_type,content)
                VALUES (?,?,?,?,?)
                """, id, owner, performance, image.contentType(), image.content());
    }

    @Override
    public Optional<Background> draftBackground(UUID id, UUID performance, UUID owner) {
        return first("""
                SELECT content_type,content FROM layout_backgrounds
                WHERE id=? AND organization_id=? AND source_performance_id=?
                """, this::background, id, owner, performance);
    }

    @Override
    public Optional<Background> publishedBackground(UUID id, UUID performance, long version) {
        return first("""
                SELECT b.content_type,b.content FROM performance_layouts l JOIN layout_backgrounds b ON b.id=l.background_id
                WHERE l.performance_id=? AND l.version=? AND b.id=?
                """, this::background, performance, version, id);
    }

    private Background background(ResultSet rs, int n) throws SQLException {
        return new Background(rs.getString("content_type"), rs.getBytes("content"));
    }

    @Override
    public Publication publication(Performance performance) {
        return first("""
                SELECT version,ticketing_ack,checkin_ack FROM performance_sale_publications WHERE performance_id=? AND version=?
                """, (rs, n) -> new Publication(performance.status(), rs.getLong("version"),
                rs.getBoolean("ticketing_ack"), rs.getBoolean("checkin_ack")), performance.id(), performance.saleVersion())
                .orElse(new Publication(performance.status(), performance.saleVersion(), false, false));
    }

    @Override
    public void savePublication(
            SaleSnapshot snapshot, UUID actor, Long publishedLayout, String status, boolean suspended) {
        jdbc.update("UPDATE performances SET sale_version=?,layout_version=?,status=?,sales_suspended=? WHERE id=?",
                snapshot.version(), publishedLayout, status, suspended, snapshot.id());
        jdbc.update("""
                INSERT INTO performance_sale_publications(performance_id,version,payload,actor_id)
                VALUES (?,?,CAST(? AS JSONB),?)
                """, snapshot.id(), snapshot.version(), write(snapshot), actor);
    }

    @Override
    public void changeTiming(UUID id, OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors,
                             OffsetDateTime saleStart, OffsetDateTime saleEnd, OffsetDateTime resumedAdmissionAt) {
        jdbc.update("""
                UPDATE performances SET starts_at=?,ends_at=?,doors_open_at=?,sale_start_at=?,sale_end_at=?,
                resumed_admission_at=? WHERE id=?
                """, starts, ends, doors, saleStart, saleEnd, resumedAdmissionAt, id);
    }

    private String checksum(PerformanceLayout value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(value)));
        } catch (NoSuchAlgorithmException | JsonProcessingException failure) {
            throw new IllegalStateException("Layout checksum failed", failure);
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Invalid local catalog document", failure);
        }
    }

    private <T> T read(String value, Class<T> type) {
        try {
            return json.readValue(value, type);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Invalid local catalog document", failure);
        }
    }

    private <T> T read(String value, TypeReference<T> type) {
        try {
            return json.readValue(value, type);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Invalid local catalog document", failure);
        }
    }

    private <T> Optional<T> first(String sql, RowMapper<T> mapper, Object... args) {
        return jdbc.query(sql, mapper, args).stream().findFirst();
    }

    private static UUID id(ResultSet rs, String name) throws SQLException {
        return rs.getObject(name, UUID.class);
    }

    private static OffsetDateTime time(ResultSet rs, String name) throws SQLException {
        return rs.getObject(name, OffsetDateTime.class);
    }

    private static UUID backgroundId(String url) {
        return url == null ? null : UUID.fromString(url.substring(url.lastIndexOf('/') + 1));
    }

    private static String publicBackgroundUrl(UUID performanceId, long revision, UUID assetId) {
        if (assetId == null) return null;
        return "/api/v2/performances/" + performanceId + "/layout/background/" + assetId + "?version=" + revision;
    }
}
