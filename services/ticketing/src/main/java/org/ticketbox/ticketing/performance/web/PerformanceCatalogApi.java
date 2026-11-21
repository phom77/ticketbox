package org.ticketbox.ticketing.performance.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.performance.application.port.PerformanceCatalog;
import org.ticketbox.ticketing.performance.domain.PerformanceSale;

import java.util.UUID;

@RestController
class PerformanceCatalogApi {
    private final PerformanceCatalog catalog;

    PerformanceCatalogApi(PerformanceCatalog catalog) {
        this.catalog = catalog;
    }

    @PutMapping("/internal/ticketing/catalog/performances/{id}")
    Applied apply(@PathVariable UUID id, @RequestBody PerformanceSale sale) {
        if (!id.equals(sale.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        try {
            return new Applied(catalog.apply(sale));
        } catch (IllegalStateException conflict) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, conflict.getMessage());
        }
    }

    record Applied(long version) {}
}
