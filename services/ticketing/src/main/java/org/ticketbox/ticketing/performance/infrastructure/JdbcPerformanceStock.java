package org.ticketbox.ticketing.performance.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Kind;

@Repository
class JdbcPerformanceStock implements PerformanceStock {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    JdbcPerformanceStock(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public Optional<Sale> sale(UUID performanceId, boolean lock) {
        return jdbc.query("""
                SELECT p.event_id,c.title,c.venue_name,c.event_date,c.sale_start_at,c.sale_end_at,c.status,
                    c.sales_suspended,c.is_public,p.layout_version,p.source_version,p.max_per_account
                FROM performance_sales p JOIN concerts c ON c.id=p.id
                WHERE p.id=? AND c.sales_mode='V2'
                """ + (lock ? " FOR SHARE OF c" : ""), (row, n) -> new Sale(
                row.getObject("event_id", UUID.class), row.getString("title"), row.getString("venue_name"),
                row.getObject("event_date", OffsetDateTime.class),
                row.getObject("sale_start_at", OffsetDateTime.class),
                row.getObject("sale_end_at", OffsetDateTime.class), "ON_SALE".equals(row.getString("status")),
                row.getBoolean("sales_suspended"), row.getBoolean("is_public"),
                row.getObject("layout_version", Long.class), row.getLong("source_version"),
                row.getInt("max_per_account")), performanceId).stream().findFirst();
    }

    @Override
    public List<Group> groups(UUID performanceId) {
        return jdbc.query("""
                SELECT g.id,g.section_id,g.section_label,g.kind,
                    CASE WHEN g.kind='GA' THEN g.available ELSE COALESCE(s.available,0) END AS available
                FROM performance_groups g
                LEFT JOIN (
                    SELECT group_id,count(*) AS available
                    FROM performance_seats WHERE performance_id=? AND status='AVAILABLE' GROUP BY group_id
                ) s ON s.group_id=g.id
                WHERE g.performance_id=? ORDER BY g.section_label,g.id
                """, (row, n) -> new Group(row.getObject("id", UUID.class), row.getObject("section_id", UUID.class),
                row.getString("section_label"), Kind.valueOf(row.getString("kind")), row.getInt("available")),
                performanceId, performanceId);
    }

    @Override
    public boolean hasSection(UUID performanceId, UUID sectionId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM performance_groups WHERE performance_id=? AND section_id=?)
                """, Boolean.class, performanceId, sectionId));
    }

    @Override
    public List<Offer> offers(UUID performanceId) {
        return jdbc.query("""
                SELECT o.id,o.group_id,t.name,g.section_label,g.kind,t.price,o.sale_start_at,o.sale_end_at,t.is_active,
                  o.description,o.min_per_order
                FROM performance_offers o JOIN ticket_types t ON t.id=o.id
                JOIN performance_groups g ON g.performance_id=o.performance_id AND g.id=o.group_id
                WHERE o.performance_id=? ORDER BY t.price,o.id
                """, (row, n) -> new Offer(row.getObject("id", UUID.class), row.getObject("group_id", UUID.class),
                row.getString("name"), row.getString("section_label"), Kind.valueOf(row.getString("kind")),
                row.getBigDecimal("price"), row.getObject("sale_start_at", OffsetDateTime.class),
                row.getObject("sale_end_at", OffsetDateTime.class), row.getBoolean("is_active"),
                row.getString("description"), row.getInt("min_per_order")), performanceId);
    }

    @Override
    public Optional<Seat> seat(UUID performanceId, UUID seatId) {
        return jdbc.query("""
                SELECT id,group_id,row_label,seat_label,status
                FROM performance_seats WHERE performance_id=? AND id=?
                """, this::seat, performanceId, seatId).stream().findFirst();
    }

    @Override
    public List<Seat> seats(UUID performanceId, UUID sectionId) {
        return jdbc.query("""
                SELECT s.id,s.group_id,s.row_label,s.seat_label,s.status
                FROM performance_seats s
                JOIN performance_groups g ON g.performance_id=s.performance_id AND g.id=s.group_id
                WHERE s.performance_id=? AND g.section_id=? ORDER BY s.id
                """, this::seat, performanceId, sectionId);
    }

    private Seat seat(ResultSet row, int index) throws SQLException {
        return new Seat(row.getObject("id", UUID.class), row.getObject("group_id", UUID.class),
                row.getString("row_label"), row.getString("seat_label"), "AVAILABLE".equals(row.getString("status")));
    }

    @Override
    public Optional<Hold> current(Scope scope) {
        return jdbc.query("""
                SELECT id,token_hash,version,expires_at FROM performance_holds WHERE performance_id=? AND user_id=?
                """, (row, n) -> new Hold(row.getObject("id", UUID.class),row.getString("token_hash"),
                row.getLong("version"),row.getObject("expires_at", OffsetDateTime.class),List.of()),
                scope.performanceId(), scope.userId()).stream().findFirst().map(hold -> new Hold(
                hold.id(), hold.tokenHash(), hold.version(), hold.expiresAt(), items(hold.id())));
    }

    private List<Line> items(UUID id) {
        return jdbc.query("""
                SELECT offer_id,group_id,seat_id,quantity,unit_price,offer_name,section_label,row_label,seat_label
                FROM performance_hold_items WHERE hold_id=? ORDER BY position
                """, (row, n) -> new Line(row.getObject("offer_id", UUID.class), row.getObject("group_id", UUID.class),
                row.getObject("seat_id", UUID.class), row.getInt("quantity"), row.getBigDecimal("unit_price"),
                row.getString("offer_name"), row.getString("section_label"), row.getString("row_label"),
                row.getString("seat_label")), id);
    }

    @Override
    public int activeOrderQuantity(Scope scope) {
        return jdbc.queryForObject("""
                SELECT COALESCE(sum(i.quantity),0)
                FROM orders o JOIN order_items i ON i.order_id=o.id
                WHERE o.user_id=? AND o.concert_id=? AND o.status IN ('AWAITING_PAYMENT','PAID')
                """, Integer.class, scope.userId(), scope.performanceId());
    }

    @Override
    public void replace(Scope scope, Hold hold, List<Line> previous) {
        jdbc.update("""
                INSERT INTO performance_holds(id,performance_id,user_id,token_hash,version,expires_at)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT (id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
                    version=EXCLUDED.version,expires_at=EXCLUDED.expires_at
                """, hold.id(), scope.performanceId(), scope.userId(), hold.tokenHash(), hold.version(), hold.expiresAt());
        var deltas = new TreeMap<UUID, Integer>();
        mergeGa(deltas, previous, -1);
        mergeGa(deltas, hold.items(), 1);
        for (var entry : deltas.entrySet()) {
            int delta = entry.getValue();
            if (delta == 0) continue;
            int changed = jdbc.update("""
                    UPDATE performance_groups SET available=available-?,held=held+?
                    WHERE performance_id=? AND id=? AND kind='GA' AND available>=? AND held>=?
                    """, delta, delta, scope.performanceId(), entry.getKey(), Math.max(0, delta), Math.max(0, -delta));
            ensureStock(changed, entry.getKey());
        }

        var oldSeats = seatIds(previous);
        var newSeats = seatIds(hold.items());
        var affected = new TreeSet<>(oldSeats);
        affected.addAll(newSeats);
        for (UUID seat : affected) {
            if (oldSeats.contains(seat) && newSeats.contains(seat)) continue;
            int changed = newSeats.contains(seat)
                    ? jdbc.update("""
                            UPDATE performance_seats SET status='HELD',hold_id=?
                            WHERE performance_id=? AND id=? AND status='AVAILABLE'
                            """, hold.id(), scope.performanceId(), seat)
                    : jdbc.update("""
                            UPDATE performance_seats SET status='AVAILABLE',hold_id=NULL
                            WHERE performance_id=? AND id=? AND status='HELD' AND hold_id=?
                            """, scope.performanceId(), seat, hold.id());
            ensureStock(changed, seat);
        }
        jdbc.update("DELETE FROM performance_hold_items WHERE hold_id=?", hold.id());
        for (int position = 0; position < hold.items().size(); position++) {
            Line line = hold.items().get(position);
            jdbc.update("""
                    INSERT INTO performance_hold_items(hold_id,performance_id,position,offer_id,group_id,seat_id,
                        quantity,unit_price,offer_name,section_label,row_label,seat_label)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    """, hold.id(), scope.performanceId(), position, line.offerId(), line.groupId(), line.seatId(),
                    line.quantity(), line.unitPrice(), line.offerName(), line.sectionLabel(), line.rowLabel(), line.seatLabel());
        }
    }

    @Override
    public void allocate(Scope scope, Hold hold, List<Allocation> allocations) {
        var counts = new TreeMap<UUID, Integer>();
        mergeGa(counts, hold.items(), 1);
        for (var entry : counts.entrySet()) {
            int quantity = entry.getValue();
            int changed = jdbc.update("""
                    UPDATE performance_groups SET held=held-?,allocated=allocated+?
                    WHERE performance_id=? AND id=? AND held>=?
                    """, quantity, quantity, scope.performanceId(), entry.getKey(), quantity);
            ensureStock(changed, entry.getKey());
        }
        var seats = new TreeMap<UUID, UUID>();
        for (Allocation allocation : allocations) {
            if (allocation.line().seatId() != null) seats.put(allocation.line().seatId(), allocation.orderItemId());
        }
        for (var entry : seats.entrySet()) {
            int changed = jdbc.update("""
                    UPDATE performance_seats SET status='ALLOCATED',hold_id=NULL,order_item_id=?
                    WHERE performance_id=? AND id=? AND status='HELD' AND hold_id=?
                    """, entry.getValue(), scope.performanceId(), entry.getKey(), hold.id());
            ensureStock(changed, entry.getKey());
        }
        jdbc.update("DELETE FROM performance_hold_items WHERE hold_id=?", hold.id());
        jdbc.update("UPDATE performance_holds SET expires_at=NULL, version=version+1 WHERE id=?", hold.id());
    }

    @Override
    public void releaseAllocation(UUID performanceId, UUID groupId, UUID seatId, int quantity, UUID orderItemId) {
        if (seatId == null) {
            ensureStock(jdbc.update("""
                    UPDATE performance_groups SET allocated=allocated-?,available=available+?
                    WHERE performance_id=? AND id=? AND allocated>=?
                    """, quantity, quantity, performanceId, groupId, quantity), groupId);
        } else {
            ensureStock(jdbc.update("""
                    UPDATE performance_seats SET status='AVAILABLE',order_item_id=NULL
                    WHERE performance_id=? AND id=? AND status='ALLOCATED' AND order_item_id=?
                    """, performanceId, seatId, orderItemId), seatId);
        }
    }

    @Override
    public Optional<SavedRequest> request(Scope scope, String key) {
        return jdbc.query("""
                SELECT payload_hash,response::text FROM performance_hold_requests
                WHERE performance_id=? AND user_id=? AND request_key=?
                """, (row, n) -> new SavedRequest(row.getString(1), decode(row.getString(2))),
                scope.performanceId(), scope.userId(), key).stream().findFirst();
    }

    @Override
    public void remember(Scope scope, String key, SavedRequest request) {
        try {
            jdbc.update("""
                    INSERT INTO performance_hold_requests(performance_id,user_id,request_key,payload_hash,response)
                    VALUES(?,?,?,?,CAST(? AS jsonb))
                    """, scope.performanceId(), scope.userId(), key, request.payloadHash(),
                    json.writeValueAsString(request.hold()));
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Invalid hold response", failure);
        }
    }

    @Override
    public List<Scope> expiredOwners(OffsetDateTime now) {
        return jdbc.query("""
                SELECT performance_id,user_id FROM performance_holds
                WHERE expires_at<=? ORDER BY expires_at,performance_id,user_id LIMIT 100
                """, (row,n) -> new Scope(row.getObject("performance_id",UUID.class),row.getObject("user_id",UUID.class)), now);
    }

    private Hold decode(String response) throws SQLException {
        try {
            return json.readValue(response, Hold.class);
        } catch (JsonProcessingException failure) {
            throw new SQLException("Invalid stored hold response", failure);
        }
    }

    private static void mergeGa(Map<UUID, Integer> counts, List<Line> lines, int sign) {
        for (Line line : lines) {
            if (line.seatId() == null) counts.merge(line.groupId(), sign * line.quantity(), Integer::sum);
        }
    }

    private static TreeSet<UUID> seatIds(List<Line> lines) {
        var result = new TreeSet<UUID>();
        for (Line line : lines) if (line.seatId() != null) result.add(line.seatId());
        return result;
    }

    private static void ensureStock(int changed, UUID id) {
        if (changed != 1) throw new AppException(ErrorCode.TICKET_SOLD_OUT, "error.performance.stock-conflict", id);
    }
}
