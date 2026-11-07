package org.ticketbox.ticketing.inventory.application.port;

import java.util.List;
import java.util.Map;

public interface StockQueries {
    List<Map<String, Object>> stock();
}
