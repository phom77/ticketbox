package org.ticketbox.split;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/split")
public class ProjectionApi {
    private final ProjectionReceiver receiver;

    public ProjectionApi(ProjectionReceiver receiver) {
        this.receiver = receiver;
    }

    @PostMapping("/catalog")
    public void catalog(@RequestBody JsonNode envelope) {
        receiver.catalog(envelope);
    }

    @PostMapping("/tickets")
    public void ticket(@RequestBody JsonNode envelope) {
        receiver.ticket(envelope);
    }
}
