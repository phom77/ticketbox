package org.ticketbox.checkin.web.internal;

import com.fasterxml.jackson.databind.JsonNode;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.checkin.application.port.ProjectionSnapshots;

@RestController
@RequestMapping("/internal/split")
public class ProjectionApi {
    private final ProjectionSnapshots receiver;

    public ProjectionApi(ProjectionSnapshots receiver) {
        this.receiver = receiver;
    }

    @PostMapping("/catalog")
    public ResponseEntity<Void> catalog(@RequestBody JsonNode envelope) {
        receiver.catalog(envelope);
        return ResponseEntity.ok().header("X-Catalog-Consumer", "checkin").build();
    }

    @PostMapping("/tickets")
    public void ticket(@RequestBody JsonNode envelope) {
        receiver.ticket(envelope);
    }
}
