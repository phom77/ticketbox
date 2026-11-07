package org.ticketbox.ticketing.issuance.application.port;

import java.util.UUID;

public interface TicketSigner {
    String sign(UUID concertId, UUID ticketTypeId, UUID userId, String secret);
}
