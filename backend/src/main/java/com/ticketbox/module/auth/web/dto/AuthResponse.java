package com.ticketbox.module.auth.web.dto;

import com.ticketbox.module.auth.domain.User;
import java.util.UUID;

public record AuthResponse(
    String accessToken,
    String tokenType,
    long expiresIn,
    UserSummary user
) {
    public record UserSummary(
        UUID id,
        String email,
        String fullName,
        User.Role role
    ) {}
}
