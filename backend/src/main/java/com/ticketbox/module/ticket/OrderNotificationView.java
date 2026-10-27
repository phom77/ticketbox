package com.ticketbox.module.ticket;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record OrderNotificationView(
        UUID orderId,
        UUID userId,
        UUID concertId,
        String concertTitle,
        OffsetDateTime eventDate,
        String venueName,
        BigDecimal totalAmount,
        List<OrderNotificationItemView> items
) {
    public int totalTickets() {
        return items.stream().mapToInt(OrderNotificationItemView::quantity).sum();
    }
}
