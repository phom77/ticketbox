package org.ticketbox.identity.auth.application.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "{validation.email.required}")
                @Email(message = "{validation.email.invalid}")
                String email,
        @NotBlank(message = "{validation.password.required}")
                @Size(min = 6, message = "{validation.password.min-size}")
                String password,
        @NotBlank(message = "{validation.full-name.required}") String fullName,
        String phone) {}
