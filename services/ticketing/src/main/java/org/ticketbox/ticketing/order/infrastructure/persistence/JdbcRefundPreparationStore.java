package org.ticketbox.ticketing.order.infrastructure.persistence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.ticketing.order.application.port.RefundPreparationStore;

import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
class JdbcRefundPreparationStore implements RefundPreparationStore {
    private final JdbcTemplate db;

    JdbcRefundPreparationStore(JdbcTemplate db) { this.db = db; }

    public Optional<Preparation> find(UUID orderId) {
        return db.query("SELECT * FROM order_refunds WHERE order_id=?", (row, n) -> new Preparation(
                row.getObject("case_id", UUID.class), orderId,
                Arrays.stream((UUID[]) row.getArray("ticket_ids").getArray()).toList(),
                State.valueOf(row.getString("state")), row.getBoolean("compensation"), row.getString("external_reference")),
                orderId).stream().findFirst();
    }

    public void insert(Preparation preparation) {
        String ids = preparation.ticketIds().stream().map(UUID::toString).collect(Collectors.joining(",", "{", "}"));
        db.update("INSERT INTO order_refunds(case_id,order_id,ticket_ids,state,compensation) VALUES (?,?,?::uuid[],?,?)",
                preparation.caseId(), preparation.orderId(), ids, preparation.state().name(), preparation.compensation());
    }

    public void finish(UUID caseId, State state, String reference) {
        db.update("UPDATE order_refunds SET state=?,external_reference=? WHERE case_id=?", state.name(), reference, caseId);
    }
}
