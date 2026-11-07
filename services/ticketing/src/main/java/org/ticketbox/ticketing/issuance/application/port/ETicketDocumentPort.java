package org.ticketbox.ticketing.issuance.application.port;

import java.util.Optional;
import java.util.UUID;

public interface ETicketDocumentPort {
    Optional<ETicketDocument> createForOrder(UUID orderId);
}
