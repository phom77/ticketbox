package com.ticketbox.module.concert.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

public record UpdateConcertRequest(
        @NotBlank(message = "Tên concert không được để trống")
        String title,

        String description,

        @NotBlank(message = "Tên địa điểm không được để trống")
        String venueName,

        @NotBlank(message = "Địa chỉ địa điểm không được để trống")
        String venueAddress,

        @NotNull(message = "Vui lòng chọn ngày diễn")
        OffsetDateTime eventDate,

        OffsetDateTime doorsOpenAt,

        @NotNull(message = "Vui lòng chọn ngày mở bán")
        OffsetDateTime saleStartAt,

        OffsetDateTime saleEndAt,

        String seatMapSvg
) {}
