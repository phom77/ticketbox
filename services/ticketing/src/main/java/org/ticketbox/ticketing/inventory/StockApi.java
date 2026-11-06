package org.ticketbox.ticketing.inventory;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
public class StockApi {
    private final JdbcTemplate jdbc;

    public StockApi(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    @GetMapping("/internal/split/stock")
    public List<Map<String,Object>> stock() {
        return jdbc.queryForList("SELECT ticket_type_id,available_qty FROM ticket_inventory ORDER BY ticket_type_id");
    }
}
