package com.ticketbox.module.checkin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CheckinHistoryResponse(
        UUID id,
        UUID ticketId,
        UUID concertId,
        UUID staffId,
        String deviceId,
        OffsetDateTime checkedAt,
        OffsetDateTime syncAt,
        boolean offline,
        String gate,
        String notes,
        String qrCode,
        String ticketStatus
) {
}
