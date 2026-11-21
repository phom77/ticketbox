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
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.performance.application.PerformanceStore;
import org.ticketbox.catalog.performance.application.PerformanceViews.*;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

@Repository
public class JdbcPerformanceStore implements PerformanceStore {
    private static final TypeReference<List<PerformanceLayout.Point>> POINTS = new TypeReference<>() {};
    private static final TypeReference<List<PerformanceLayout.Shape>> SHAPES = new TypeReference<>() {};
    private static final TypeReference<List<Space>> SPACES = new TypeReference<>() {};
    private static final String PUBLIC_EVENT = """
            EXISTS (SELECT 1 FROM catalog_performance_view p WHERE p.event_id = e.id AND p.discoverable)
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
        var rows = named.query("""
                SELECT e.id,e.title,e.description,e.category,e.draft_version FROM catalog_event_view e WHERE %s
                ORDER BY e.created_at DESC,e.id LIMIT :limit OFFSET :offset
                """.formatted(where), params, (rs, n) -> readEvent(rs));
        return new PageImpl<>(withPerformances(rows, organizer == null), page, total);
    }

    @Override
    public Optional<Event> event(UUID id, UUID organizer) {
        var where = organizer == null ? PUBLIC_EVENT : "e.organization_id = :organizer";
        var params = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                .addValue("id", id).addValue("organizer", organizer);
        var rows = named.query("""
                SELECT e.id,e.title,e.description,e.category,e.draft_version FROM catalog_event_view e WHERE e.id=:id AND %s
                """.formatted(where), params, (rs, n) -> readEvent(rs));
        return withPerformances(rows, organizer == null).stream().findFirst();
    }

    private static Event readEvent(ResultSet rs) throws SQLException {
        return new Event(id(rs, "id"), rs.getString("title"), rs.getString("description"),
                rs.getString("category"), rs.getLong("draft_version"), List.of());
    }

    private List<Event> withPerformances(List<Event> events, boolean publicOnly) {
        if (events.isEmpty()) return events;
        var performances = named.query("""
                SELECT * FROM catalog_performance_view WHERE event_id IN (:ids)
                """ + (publicOnly ? " AND discoverable" : "") + " ORDER BY starts_at,id",
                Map.of("ids", events.stream().map(Event::id).toList()), this::performance)
                .stream().collect(Collectors.groupingBy(Performance::eventId));
        return events.stream().map(event -> new Event(event.id(), event.title(), event.description(),
                event.category(), event.draftVersion(), performances.getOrDefault(event.id(), List.of()))).toList();
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
    public void createEvent(UUID id, UUID organizer, String title, String description, String category) {
        jdbc.update("INSERT INTO events(id,organization_id,title,description,category) VALUES(?,?,?,?,?)",
                id, organizer, title, description, category);
    }

    @Override
    public void updateDraftEvent(UUID id, String title, String description, String category) {
        jdbc.update("""
                UPDATE events SET title=?,description=?,category=?,draft_version=draft_version+1 WHERE id=?
                """, title, description, category, id);
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
                SELECT id,group_id,name,price,currency,sale_start_at,sale_end_at,active
                FROM performance_sale_offers WHERE performance_id=? ORDER BY sort_index
                """, (row, index) -> new PerformanceSale.Offer(id(row, "id"), id(row, "group_id"),
                row.getString("name"), row.getBigDecimal("price"), row.getString("currency"),
                time(row, "sale_start_at"), time(row, "sale_end_at"), row.getBoolean("active")), id);
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
                    offer.saleStartAt(), offer.saleEndAt(), offer.active(), position});
        }
        jdbc.batchUpdate("""
                INSERT INTO performance_sale_offers(
                    performance_id,id,group_id,name,price,currency,sale_start_at,sale_end_at,active,sort_index)
                VALUES (?,?,?,?,?,?,?,?,?,?)
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
