package org.ticketbox.identity.auth.dto;

import org.ticketbox.identity.account.User;
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
