package com.ticketbox.module.concert.web.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record CreateTicketTypeRequest(
        @NotBlank(message = "Tên hạng vé không được để trống")
        String name,

        @NotNull(message = "Vui lòng nhập giá vé")
        @DecimalMin(value = "0.0", message = "Giá vé không được âm")
        BigDecimal price,

        @Min(value = 1, message = "Tổng số lượng phải ít nhất là 1")
        int totalQuantity,

        @Min(value = 1, message = "Giới hạn mỗi tài khoản phải ít nhất là 1")
        int maxPerAccount,

        @Pattern(regexp = "^#([A-Fa-f0-9]{6})$", message = "Màu khu vực phải là mã màu hex hợp lệ, ví dụ #E11D48")
        String zoneColor
) {}
