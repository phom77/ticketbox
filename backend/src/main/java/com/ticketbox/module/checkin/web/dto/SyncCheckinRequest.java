package com.ticketbox.module.checkin.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record SyncCheckinRequest(
        @NotNull UUID concertId,
        @NotBlank String deviceId,
        @NotNull @Size(min = 1, max = 500) @Valid List<OfflineLogEntry> logs
) {
    public record OfflineLogEntry(
            @NotBlank String qrCode,
            @NotNull OffsetDateTime checkedAt,
            String gate,
            String notes
    ) {}
}
