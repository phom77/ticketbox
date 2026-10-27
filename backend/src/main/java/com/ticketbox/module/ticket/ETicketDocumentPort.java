package com.ticketbox.module.ticket;

import java.util.Optional;
import java.util.UUID;

public interface ETicketDocumentPort {
    Optional<ETicketDocument> createForOrder(UUID orderId);
}
