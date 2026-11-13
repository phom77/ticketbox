package org.ticketbox.ticketing.order.application.port;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface OrderDeliveryStatus {
    record Email(UUID id, String status, OffsetDateTime updatedAt) {}

    List<Email> emails(UUID orderId);

    OrderSupportQueue.Page failedEmails(int page, int size);
}
