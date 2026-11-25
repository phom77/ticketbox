package org.ticketbox.ticketing.issuance.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.issuance.application.port.TicketTransferStore;
import org.ticketbox.ticketing.issuance.domain.Ticket;
import org.ticketbox.ticketing.issuance.domain.TicketTransfer;
import org.ticketbox.ticketing.issuance.domain.TransferEligibility;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
class JdbcTicketTransferStore implements TicketTransferStore {
    private static final String TRANSFER_COLUMNS = """
            x.id, x.ticket_id, x.sender_id, x.recipient_id, x.sender_name, x.recipient_name, x.status,
            x.created_at, x.decided_at, x.expires_at, x.new_ticket_id
            """;
    private static final String DETAIL_SELECT = "SELECT " + TRANSFER_COLUMNS + """
            , o.id AS order_id, t.concert_id, COALESCE(o.performance_title, c.title) AS title,
            COALESCE(o.performance_starts_at, c.event_date) AS event_date,
            COALESCE(i.offer_name, ty.name) AS type_name,
            COALESCE(o.performance_venue_name, c.venue_name) AS venue,
            i.section_label, i.row_label, i.seat_label
            FROM ticket_transfers x JOIN tickets t ON t.id = x.ticket_id
            JOIN order_items i ON i.id = t.order_item_id JOIN orders o ON o.id = i.order_id
            JOIN concerts c ON c.id = t.concert_id LEFT JOIN ticket_types ty ON ty.id = t.ticket_type_id
            """;

    private final JdbcTemplate jdbc;

    JdbcTicketTransferStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<UUID> orderIdOfTicket(UUID ticketId) {
        return jdbc.query("SELECT i.order_id FROM tickets t JOIN order_items i ON i.id = t.order_item_id WHERE t.id = ?",
                (rs, n) -> rs.getObject(1, UUID.class), ticketId).stream().findFirst();
    }

    @Override
    public void lockOrder(UUID orderId) {
        jdbc.query("SELECT id FROM orders WHERE id = ? FOR UPDATE", (rs, n) -> rs.getObject(1), orderId);
    }

    @Override
    public Optional<TicketFacts> facts(UUID ticketId) {
        return jdbc.query("""
                SELECT t.id, o.id AS order_id, t.concert_id, t.ticket_type_id, t.user_id, t.status,
                    t.transferred_from_ticket_id IS NOT NULL AS received,
                    COALESCE(o.performance_title, c.title) AS title,
                    COALESCE(o.performance_starts_at, c.event_date) AS event_date,
                    COALESCE(c.doors_open_at, o.performance_starts_at, c.event_date) AS doors,
                    (EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id = o.id
                        AND r.state IN ('PREPARED', 'CONFIRMED'))
                     OR EXISTS (SELECT 1 FROM refund_requests q WHERE q.order_id = o.id
                        AND q.status IN ('REQUESTED', 'APPROVED'))) AS refund_hold,
                    EXISTS (SELECT 1 FROM event_disruptions d WHERE d.concert_id = t.concert_id) AS disrupted
                FROM tickets t JOIN order_items i ON i.id = t.order_item_id JOIN orders o ON o.id = i.order_id
                JOIN concerts c ON c.id = t.concert_id WHERE t.id = ?
                """, (rs, n) -> new TicketFacts(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getObject("concert_id", UUID.class), rs.getObject("ticket_type_id", UUID.class),
                rs.getObject("user_id", UUID.class), rs.getString("title"),
                rs.getObject("event_date", OffsetDateTime.class),
                new TransferEligibility.Facts(Ticket.Status.valueOf(rs.getString("status")),
                        rs.getBoolean("received"),
                        TransferEligibility.cutoff(rs.getObject("doors", OffsetDateTime.class)),
                        rs.getBoolean("refund_hold"), rs.getBoolean("disrupted"))), ticketId).stream().findFirst();
    }

    @Override
    public Optional<TicketTransfer> find(UUID transferId) {
        return one("WHERE x.id = ?", transferId);
    }

    @Override
    public Optional<TicketTransfer> findPendingByTicket(UUID ticketId) {
        return one("WHERE x.ticket_id = ? AND x.status = 'PENDING'", ticketId);
    }

    @Override
    public Optional<TicketTransfer> findLatestByTicket(UUID ticketId) {
        return one("WHERE x.ticket_id = ? ORDER BY x.created_at DESC LIMIT 1", ticketId);
    }

    @Override
    public Optional<TicketTransfer> findByNewTicket(UUID ticketId) {
        return one("WHERE x.new_ticket_id = ?", ticketId);
    }

    private Optional<TicketTransfer> one(String where, Object argument) {
        return jdbc.query("SELECT " + TRANSFER_COLUMNS + " FROM ticket_transfers x " + where, TRANSFERS, argument)
                .stream().findFirst();
    }

    @Override
    public Optional<Detail> detail(UUID transferId) {
        return jdbc.query(DETAIL_SELECT + " WHERE x.id = ?", DETAILS, transferId).stream().findFirst();
    }

    @Override
    public List<Detail> detailsFor(UUID accountId, int limit) {
        return jdbc.query(DETAIL_SELECT + " WHERE x.sender_id = ? OR x.recipient_id = ? ORDER BY x.created_at DESC LIMIT ?",
                DETAILS, accountId, accountId, limit);
    }

    @Override
    public void insert(TicketTransfer t) {
        jdbc.update("""
                INSERT INTO ticket_transfers(id, ticket_id, sender_id, recipient_id, sender_name, recipient_name,
                    status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, t.id(), t.ticketId(), t.senderId(), t.recipientId(), t.senderName(), t.recipientName(),
                t.status().name(), t.createdAt(), t.expiresAt());
    }

    @Override
    public void update(TicketTransfer t) {
        jdbc.update("UPDATE ticket_transfers SET status = ?, decided_at = ?, new_ticket_id = ? WHERE id = ?",
                t.status().name(), t.decidedAt(), t.newTicketId(), t.id());
    }

    @Override
    public void replaceTicket(UUID originalTicketId, UUID replacementTicketId, UUID recipientId, String qrCode,
            String qrSecret) {
        // The original is retired first; the unique QR codes and the projection trigger see both changes.
        int retired = jdbc.update("UPDATE tickets SET status = 'TRANSFERRED', updated_at = now() WHERE id = ? AND status = 'VALID'",
                originalTicketId);
        if (retired != 1) throw new IllegalStateException("Ticket is no longer valid for transfer");
        jdbc.update("""
                INSERT INTO tickets(id, order_item_id, ticket_type_id, concert_id, user_id, qr_code, qr_secret,
                    status, transferred_from_ticket_id)
                SELECT ?, order_item_id, ticket_type_id, concert_id, ?, ?, ?, 'VALID', id FROM tickets WHERE id = ?
                """, replacementTicketId, recipientId, qrCode, qrSecret, originalTicketId);
    }

    @Override
    public long countOffersSince(UUID senderId, OffsetDateTime since) {
        Long count = jdbc.queryForObject("SELECT count(*) FROM ticket_transfers WHERE sender_id = ? AND created_at >= ?",
                Long.class, senderId, since);
        return count == null ? 0 : count;
    }

    @Override
    public List<UUID> dueTransferIds(OffsetDateTime now, int limit) {
        return jdbc.query("SELECT id FROM ticket_transfers WHERE status = 'PENDING' AND expires_at <= ? ORDER BY expires_at, id LIMIT ?",
                (rs, n) -> rs.getObject(1, UUID.class), now, limit);
    }

    private static final RowMapper<TicketTransfer> TRANSFERS = (rs, n) -> transfer(rs);

    private static final RowMapper<Detail> DETAILS = (rs, n) -> new Detail(transfer(rs),
            rs.getObject("order_id", UUID.class), rs.getObject("concert_id", UUID.class), rs.getString("title"),
            rs.getObject("event_date", OffsetDateTime.class), rs.getString("type_name"), rs.getString("venue"),
            rs.getString("section_label"), rs.getString("row_label"), rs.getString("seat_label"));

    private static TicketTransfer transfer(ResultSet rs) throws SQLException {
        return new TicketTransfer(rs.getObject("id", UUID.class), rs.getObject("ticket_id", UUID.class),
                rs.getObject("sender_id", UUID.class), rs.getObject("recipient_id", UUID.class),
                rs.getString("sender_name"), rs.getString("recipient_name"),
                TicketTransfer.Status.valueOf(rs.getString("status")), rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("decided_at", OffsetDateTime.class), rs.getObject("expires_at", OffsetDateTime.class),
                rs.getObject("new_ticket_id", UUID.class));
    }
}
