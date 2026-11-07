package org.ticketbox.catalog.sales.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.sales.application.port.CatalogAvailabilityReader;

import java.util.UUID;

/** Public availability is a cached projection. Sale edits publish through the DB outbox. */
@Component
public class CatalogInventory implements CatalogAvailabilityReader {
    private final JdbcTemplate jdbc;

    public CatalogInventory(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int available(UUID id) {
        return jdbc.queryForObject(
                """
SELECT COALESCE((SELECT available_qty FROM catalog_availability WHERE ticket_type_id=t.id),t.total_quantity)
FROM ticket_types t WHERE t.id=?
""",
                Integer.class,
                id);
    }
}
