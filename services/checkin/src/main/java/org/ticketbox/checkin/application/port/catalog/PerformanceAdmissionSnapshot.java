package org.ticketbox.checkin.application.port.catalog;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record PerformanceAdmissionSnapshot(
        @NotNull UUID id,
        @NotNull UUID organizationId,
        UUID legacyConcertId,
        @Positive long version,
        @NotBlank @Size(max = 500) String title,
        @NotBlank @Size(max = 500) String venueName,
        String venueAddress,
        @NotNull OffsetDateTime startsAt,
        OffsetDateTime doorsOpenAt,
        @NotNull OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt,
        @NotNull @Pattern(regexp = "ON_SALE|SOLD_OUT|CANCELLED|COMPLETED") String status,
        boolean salesSuspended,
        OffsetDateTime resumedAdmissionAt,
        boolean publicVisible,
        @Positive int maxPerAccount,
        @NotNull List<@NotNull @Valid Offer> offers) {
    public record Offer(
            @NotNull UUID id,
            @NotBlank @Size(max = 100) String name,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 0) BigDecimal price,
            boolean active) {}
}
