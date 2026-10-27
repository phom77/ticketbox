package com.ticketbox.module.auth.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @NotBlank(message = "Vui lòng nhập email")
    @Email(message = "Email không hợp lệ")
    String email,

    @NotBlank(message = "Vui lòng nhập mật khẩu")
    @Size(min = 6, message = "Mật khẩu phải có ít nhất 6 ký tự")
    String password,

    @NotBlank(message = "Vui lòng nhập họ tên")
    String fullName,

    String phone
) {}
