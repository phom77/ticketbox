package org.ticketbox.ticketing.order.web;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.ticketing.order.application.DisruptionOptionsService;
import org.ticketbox.ticketing.order.application.dto.DisruptionNotice;
import org.ticketbox.ticketing.order.application.dto.EventOptions;
import org.ticketbox.ticketing.web.ApiResponse;

import java.util.List;
import java.util.UUID;

@RestController
class DisruptionOptionsController {
    private final DisruptionOptionsService options;

    DisruptionOptionsController(DisruptionOptionsService options) {
        this.options = options;
    }

    @GetMapping("/api/tickets/disruptions")
    ResponseEntity<ApiResponse<List<DisruptionNotice>>> notices(Authentication auth) {
        return noStore(options.notices(account(auth)));
    }

    @GetMapping("/api/tickets/events/{concertId}/options")
    ResponseEntity<ApiResponse<EventOptions>> options(@PathVariable UUID concertId, Authentication auth) {
        return noStore(options.options(account(auth), concertId));
    }

    private static <T> ResponseEntity<ApiResponse<T>> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(body));
    }

    private static UUID account(Authentication auth) {
        return UUID.fromString(auth.getName());
    }
}
