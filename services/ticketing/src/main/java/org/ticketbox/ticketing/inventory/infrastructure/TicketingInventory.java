package org.ticketbox.ticketing.inventory.infrastructure;

import lombok.RequiredArgsConstructor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.inventory.application.port.InventoryPort;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class TicketingInventory implements InventoryPort {
    private final JdbcTemplate jdbc;

    @Override
    @Transactional(readOnly = true)
    public int available(UUID id) {
        return jdbc.queryForObject(
                "SELECT available_qty FROM ticket_inventory WHERE ticket_type_id=?",
                Integer.class,
                id);
    }

    @Override
    public boolean reserve(UUID id, int quantity) {
        positive(quantity);
        return jdbc.update(
                        "UPDATE ticket_inventory SET available_qty=available_qty-?,"
                                + " updated_at=now() WHERE ticket_type_id=? AND active AND"
                                + " available_qty>=?",
                        quantity,
                        id,
                        quantity)
                == 1;
    }

    @Override
    public void release(UUID id, int quantity) {
        positive(quantity);
        if (jdbc.update(
                        "UPDATE ticket_inventory SET available_qty=available_qty+?,"
                                + " updated_at=now() WHERE ticket_type_id=? AND"
                                + " available_qty+?<=total_quantity",
                        quantity,
                        id,
                        quantity)
                != 1)
            throw new IllegalStateException("Stock release exceeds allocation or SKU is missing");
    }

    @Override
    public void resizePristine(UUID id, int total) {
        positive(total);
        if (jdbc.update(
                        "UPDATE ticket_inventory SET total_quantity=?, available_qty=?,"
                                + " revision=revision+1, updated_at=now() WHERE ticket_type_id=? AND"
                                + " available_qty=total_quantity",
                        total,
                        total,
                        id)
                != 1)
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.stock.already-allocated");
    }

    @Override
    public void setActive(UUID id, boolean active) {
        if (jdbc.update(
                        "UPDATE ticket_inventory SET active=?, revision=revision+1,"
                                + " updated_at=now() WHERE ticket_type_id=?",
                        active,
                        id)
                != 1) throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.stock.not-found");
    }

    private void positive(int quantity) {
        new org.ticketbox.ticketing.inventory.domain.TicketQuantity(quantity);
    }
}
