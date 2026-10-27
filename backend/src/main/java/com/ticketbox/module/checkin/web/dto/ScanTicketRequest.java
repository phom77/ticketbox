package com.ticketbox.module.checkin.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record ScanTicketRequest (
        @NotBlank String qrCode,
        @NotNull UUID concertId,
        @NotBlank String deviceId,
        String gate
) {}
