package com.ticketbox.module.auth.web.dto;

import com.ticketbox.module.auth.domain.User;
import java.util.UUID;

public record CurrentUserResponse(
    UUID id,
    String email,
    String fullName,
    User.Role role
) {
    public static CurrentUserResponse from(User user) {
        return new CurrentUserResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole());
    }
}
