package com.ticketbox.module.ticket.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record OrderItemRequest(
    @NotNull(message = "Vui lòng chọn hạng vé")
    UUID ticketTypeId,

    @Min(value = 1, message = "Số lượng phải ít nhất là 1")
    int quantity
) {}
