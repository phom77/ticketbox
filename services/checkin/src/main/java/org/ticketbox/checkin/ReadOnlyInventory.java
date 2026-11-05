package org.ticketbox.checkin;

import com.ticketbox.module.inventory.InventoryPort;
import org.springframework.stereotype.Component;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;

@Component
public class ReadOnlyInventory implements InventoryPort {
    private final JdbcTemplate jdbc;

    public ReadOnlyInventory(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    public int available(UUID id) {
        return jdbc.queryForObject("SELECT available_qty FROM ticket_types WHERE id=?",Integer.class,id);
    }

    public boolean reserve(UUID id,int quantity) { throw new UnsupportedOperationException("Use Ticketing"); }
    public void release(UUID id,int quantity) { throw new UnsupportedOperationException("Use Ticketing"); }
    public void resizePristine(UUID id,int quantity) { throw new UnsupportedOperationException("Use Catalog"); }
    public void setActive(UUID id,boolean active) { throw new UnsupportedOperationException("Use Catalog"); }
}
