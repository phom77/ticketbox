package com.ticketbox.module.checkin.web.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record CheckinDatasetResponse(
        UUID concertId,
        OffsetDateTime generatedAt,
        int totalCount,
        List<TicketDatasetEntry> tickets
) {
    public record TicketDatasetEntry(
            UUID ticketId,
            String qrCode,
            String qrSecret,
            UUID ticketTypeId,
            UUID userId
    ) {}
}
