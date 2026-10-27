package com.ticketbox.shared.event;

import java.util.UUID;

public record UserLeftQueueEvent(
        UUID concertId,
        UUID userId,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        String sessionToken
 ) {
    public UserLeftQueueEvent(UUID concertId, UUID userId) { this(concertId,userId,null); }
}
