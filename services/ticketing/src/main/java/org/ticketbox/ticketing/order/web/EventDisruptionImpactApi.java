package org.ticketbox.ticketing.order.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.order.application.EventDisruptionImpact;
import org.ticketbox.ticketing.order.application.port.EventDisruptionStore;

import java.util.UUID;

@RestController
@RequestMapping("/internal/split/v1/event-disruptions")
class EventDisruptionImpactApi {
    private final EventDisruptionImpact impact;

    EventDisruptionImpactApi(EventDisruptionImpact impact) { this.impact = impact; }

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void accept(@RequestBody EventDisruptionStore.Operation operation) { impact.accept(operation); }

    @GetMapping("/{concert}")
    EventDisruptionStore.Impact impact(@PathVariable UUID concert, @RequestParam(required = false) UUID operation,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return impact.impact(concert, operation, page, size);
    }
}
