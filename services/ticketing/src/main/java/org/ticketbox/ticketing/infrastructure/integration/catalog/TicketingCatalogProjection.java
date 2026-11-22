package org.ticketbox.ticketing.infrastructure.integration.catalog;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertReminderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertReminderView;
import org.ticketbox.ticketing.application.port.catalog.ConcertReportingPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertReportingView;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.application.port.catalog.TicketTypeReportingView;
import org.ticketbox.ticketing.application.port.catalog.TicketTypeView;
import org.ticketbox.ticketing.inventory.application.port.InventoryPort;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Component
@Transactional(readOnly = true)
public class TicketingCatalogProjection
        implements ConcertOrderPort, ConcertReportingPort, ConcertReminderPort {
    private static final String SALE_BLOCKED =
            "sales_suspended OR COALESCE(public_release_at > statement_timestamp(), false)";
    private static final String SALE_COLUMNS =
            "id,title,CASE WHEN " + SALE_BLOCKED + " THEN 'DRAFT' ELSE status END AS status,event_date,sale_start_at,sale_end_at";
    private static final String REPORT_COLUMNS = "id,title,event_date,status";
    private static final String REMINDER_COLUMNS = "id,title,venue_name,venue_address,event_date";
    private static final String ATTENDABLE = "status IN ('ON_SALE','SOLD_OUT')";

    private static final RowMapper<ConcertView> SALE =
            (row, index) ->
                    new ConcertView(
                            row.getObject("id", UUID.class),
                            row.getString("title"),
                            row.getString("status"),
                            row.getObject("event_date", OffsetDateTime.class),
                            row.getObject("sale_start_at", OffsetDateTime.class),
                            row.getObject("sale_end_at", OffsetDateTime.class));
    private static final RowMapper<ConcertReportingView> REPORT =
            (row, index) ->
                    new ConcertReportingView(
                            row.getObject("id", UUID.class),
                            row.getString("title"),
                            row.getObject("event_date", OffsetDateTime.class),
                            row.getString("status"));
    private static final RowMapper<ConcertReminderView> REMINDER =
            (row, index) ->
                    new ConcertReminderView(
                            row.getObject("id", UUID.class),
                            row.getString("title"),
                            row.getString("venue_name"),
                            row.getString("venue_address"),
                            row.getObject("event_date", OffsetDateTime.class));

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final InventoryPort inventory;

    public TicketingCatalogProjection(
            JdbcTemplate jdbc, NamedParameterJdbcTemplate named, InventoryPort inventory) {
        this.jdbc = jdbc;
        this.named = named;
        this.inventory = inventory;
    }

    @Override
    public Optional<ConcertView> findConcertById(UUID concertId) {
        return jdbc
                .query("SELECT " + SALE_COLUMNS + " FROM concerts WHERE id=?", SALE, concertId)
                .stream()
                .findFirst();
    }

    @Override
    @Transactional
    public boolean lockAndCheckSalesSuspended(UUID concertId) {
        return jdbc.query("SELECT " + SALE_BLOCKED + " FROM concerts WHERE id=? FOR SHARE",
                (row, index) -> row.getBoolean(1), concertId).stream().findFirst().orElse(false);
    }

    @Override
    public List<ConcertView> findConcertsByIds(Collection<UUID> concertIds) {
        if (concertIds.isEmpty()) return List.of();
        return named.query(
                "SELECT " + SALE_COLUMNS + " FROM concerts WHERE id IN (:ids)",
                Map.of("ids", concertIds),
                SALE);
    }

    @Override
    public List<UUID> findConcertIdsOwnedBy(UUID organizerId) {
        return jdbc.queryForList(
                "SELECT id FROM concerts WHERE organization_id=?", UUID.class, organizerId);
    }

    @Override
    public boolean isConcertOwnedBy(UUID concertId, UUID organizerId) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM concerts WHERE id=? AND organization_id=?)",
                        Boolean.class,
                        concertId,
                        organizerId));
    }

    @Override
    public List<TicketTypeView> findTicketTypesByIds(Collection<UUID> ticketTypeIds) {
        if (ticketTypeIds.isEmpty()) return List.of();
        return named.query(
                """
                SELECT tt.id,tt.concert_id,tt.name,tt.price,tt.total_quantity,tt.max_per_account,tt.is_active,
                    tt.performance_offer, CASE WHEN g.kind='GA' THEN g.available
                        ELSE (SELECT count(*) FROM performance_seats s WHERE s.performance_id=g.performance_id
                            AND s.group_id=g.id AND s.status='AVAILABLE') END AS performance_available
                FROM ticket_types tt LEFT JOIN performance_offers o ON o.id=tt.id
                LEFT JOIN performance_groups g ON g.performance_id=o.performance_id AND g.id=o.group_id
                WHERE tt.id IN (:ids)
                """,
                Map.of("ids", ticketTypeIds),
                (row, index) -> {
                    UUID id = row.getObject("id", UUID.class);
                    return new TicketTypeView(
                            id,
                            row.getObject("concert_id", UUID.class),
                            row.getString("name"),
                            row.getBigDecimal("price"),
                            row.getInt("total_quantity"),
                            row.getBoolean("performance_offer") ? row.getInt("performance_available") : inventory.available(id),
                            row.getInt("max_per_account"),
                            row.getBoolean("is_active"));
                });
    }

    @Override
    public Optional<ConcertReportingView> findOwnedConcert(UUID concertId, UUID organizerId) {
        return jdbc
                .query(
                        "SELECT " + REPORT_COLUMNS + " FROM concerts WHERE id=? AND organization_id=?",
                        REPORT,
                        concertId,
                        organizerId)
                .stream()
                .findFirst();
    }

    @Override
    public Optional<ConcertReportingView> findConcert(UUID concertId) {
        return jdbc
                .query("SELECT " + REPORT_COLUMNS + " FROM concerts WHERE id=?", REPORT, concertId)
                .stream()
                .findFirst();
    }

    @Override
    public Page<ConcertReportingView> findCompletedConcerts(UUID organizerId, Pageable pageable) {
        String filter = " FROM concerts WHERE organization_id=? AND status='COMPLETED'";
        var rows =
                jdbc.query(
                        "SELECT "
                                + REPORT_COLUMNS
                                + filter
                                + " ORDER BY event_date DESC,id LIMIT ? OFFSET ?",
                        REPORT,
                        organizerId,
                        pageable.getPageSize(),
                        pageable.getOffset());
        long total = jdbc.queryForObject("SELECT count(*)" + filter, Long.class, organizerId);
        return new PageImpl<>(rows, pageable, total);
    }

    @Override
    public List<TicketTypeReportingView> findTicketTypes(UUID concertId) {
        return jdbc.query(
                """
                SELECT id,name,price,total_quantity FROM ticket_types WHERE concert_id=? AND NOT performance_offer
                UNION ALL
                SELECT g.id,g.section_label,COALESCE(min(tt.price),0) AS price,g.capacity
                FROM performance_groups g
                LEFT JOIN performance_offers o ON o.performance_id=g.performance_id AND o.group_id=g.id
                LEFT JOIN ticket_types tt ON tt.id=o.id
                WHERE g.performance_id=? GROUP BY g.id,g.section_label,g.capacity
                """,
                (row, index) ->
                        new TicketTypeReportingView(
                                row.getObject("id", UUID.class),
                                row.getString("name"),
                                row.getBigDecimal("price"),
                                row.getInt("total_quantity")),
                concertId, concertId);
    }

    @Override
    public List<ConcertReminderView> findConcertsStartingBetween(
            OffsetDateTime from, OffsetDateTime to) {
        return jdbc.query(
                "SELECT "
                        + REMINDER_COLUMNS
                        + " FROM concerts WHERE "
                        + ATTENDABLE
                        + " AND event_date BETWEEN ? AND ?",
                REMINDER,
                from,
                to);
    }

    @Override
    public Optional<ConcertReminderView> findReminderConcertById(UUID concertId) {
        return jdbc
                .query(
                        "SELECT "
                                + REMINDER_COLUMNS
                                + " FROM concerts WHERE "
                                + ATTENDABLE
                                + " AND id=?",
                        REMINDER,
                        concertId)
                .stream()
                .findFirst();
    }
}
