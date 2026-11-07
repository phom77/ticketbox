package org.ticketbox.ticketing.issuance.infrastructure;

import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.issuance.application.port.TicketSigner;

import java.util.UUID;

@Component
public class JwtTicketSigner implements TicketSigner {
    public String sign(UUID concertId, UUID ticketTypeId, UUID userId, String secret) {
        return TicketQrGenerator.generateQrToken(concertId, ticketTypeId, userId, secret);
    }
}
