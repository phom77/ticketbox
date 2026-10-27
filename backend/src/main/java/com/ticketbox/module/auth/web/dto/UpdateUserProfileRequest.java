package com.ticketbox.module.auth.web.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateUserProfileRequest(
        @Size(max = 255, message = "Họ tên không được vượt quá 255 ký tự")
        @Pattern(regexp = ".*\\S.*", message = "Họ tên không được để trống")
        String fullName,

        @Size(max = 20, message = "Số điện thoại không được vượt quá 20 ký tự")
        String phone
) {}
