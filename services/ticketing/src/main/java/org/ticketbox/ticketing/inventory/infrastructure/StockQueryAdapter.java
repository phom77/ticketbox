package org.ticketbox.ticketing.inventory.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.inventory.application.port.StockQueries;

import java.util.List;
import java.util.Map;

@Component
public class StockQueryAdapter implements StockQueries {
    private final JdbcTemplate jdbc;

    public StockQueryAdapter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> stock() {
        return jdbc.queryForList(
                "SELECT ticket_type_id,available_qty FROM ticket_inventory ORDER BY"
                        + " ticket_type_id");
    }
}
