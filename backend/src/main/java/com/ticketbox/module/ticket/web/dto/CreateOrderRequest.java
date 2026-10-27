package com.ticketbox.module.ticket.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record CreateOrderRequest(
    @NotNull(message = "Vui lòng chọn concert")
    UUID concertId,

    @NotEmpty(message = "Đơn hàng phải có ít nhất một hạng vé")
    @Valid
    List<OrderItemRequest> items
) {}
