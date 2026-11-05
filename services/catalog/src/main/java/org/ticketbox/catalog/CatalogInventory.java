package org.ticketbox.catalog;

import com.ticketbox.module.inventory.InventoryPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.util.UUID;

/** Public availability is a cached projection. Sale edits publish through the DB outbox. */
@Component
public class CatalogInventory implements InventoryPort {
    private final JdbcTemplate jdbc;

    public CatalogInventory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public int available(UUID id) {
        return jdbc.queryForObject("""
                SELECT COALESCE((SELECT available_qty FROM catalog_availability WHERE ticket_type_id=t.id),t.total_quantity)
                FROM ticket_types t WHERE t.id=?
                """, Integer.class, id);
    }

    public void resizePristine(UUID id, int total) {
        // The Catalog trigger permits quantity/price edits only while DRAFT.
        // Availability is deliberately reset only when Ticketing accepts the new version.
    }

    public void setActive(UUID id, boolean active) {
        // The parent transaction updates ticket_types and the durable outbox together.
    }

    public boolean reserve(UUID id, int quantity) {
        throw new UnsupportedOperationException("Reservations belong to Ticketing");
    }

    public void release(UUID id, int quantity) {
        throw new UnsupportedOperationException("Reservations belong to Ticketing");
    }
}
