package org.ticketbox.ticketing.inventory.web;

import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.inventory.application.port.StockQueries;

import java.util.List;
import java.util.Map;

@RestController
public class StockApi {
    private final StockQueries queries;

    public StockApi(StockQueries queries) {
        this.queries = queries;
    }

    @GetMapping("/internal/split/stock")
    public List<Map<String, Object>> stock() {
        return queries.stock();
    }
}
