package org.ticketbox.ticketing.queue.web;

import org.ticketbox.ticketing.queue.application.QueueRealtimeService;
import org.ticketbox.ticketing.queue.web.dto.QueueSubscriptionRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class QueueRealtimeController {

    private final QueueRealtimeService queueRealtimeService;

    @MessageMapping("/queue/subscribe")
    public void subscribe(
            QueueSubscriptionRequest request,
            Principal principal,
            @Header("simpSessionId") String sessionId
    ) {
        queueRealtimeService.subscribe(sessionId, UUID.fromString(principal.getName()), request.concertId());
    }
}
