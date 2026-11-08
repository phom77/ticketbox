package org.ticketbox.catalog.sales.application.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

public record CreateTicketTypeRequest(
        @NotBlank(message = "{validation.ticket-type.name-required}") String name,
        @NotNull(message = "{validation.ticket-type.price-required}")
                @DecimalMin(value = "0.0", message = "{validation.ticket-type.price-negative}")
                BigDecimal price,
        @Min(value = 1, message = "{validation.ticket-type.total-min}") int totalQuantity,
        @Min(value = 1, message = "{validation.ticket-type.account-limit-min}") int maxPerAccount,
        @Pattern(regexp = "^#([A-Fa-f0-9]{6})$", message = "{validation.ticket-type.invalid-color}")
                String zoneColor) {}
