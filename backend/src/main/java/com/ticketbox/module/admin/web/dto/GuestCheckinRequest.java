package com.ticketbox.module.admin.web.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record GuestCheckinRequest(
        @NotNull UUID concertId,
        @Size(max = 100) String gate) {
}
