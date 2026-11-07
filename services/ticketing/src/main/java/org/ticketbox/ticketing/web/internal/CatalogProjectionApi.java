package org.ticketbox.ticketing.web.internal;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.application.port.CatalogSnapshots;

@RestController
public class CatalogProjectionApi {
    private final CatalogSnapshots snapshots;

    public CatalogProjectionApi(CatalogSnapshots snapshots) {
        this.snapshots = snapshots;
    }

    @PostMapping("/internal/split/catalog")
    public void catalog(@RequestBody JsonNode envelope) {
        snapshots.catalog(envelope);
    }
}
