package org.ticketbox.identity.auth.application.dto;

import org.ticketbox.identity.account.domain.User;

import java.util.UUID;

public record CurrentUserResponse(UUID id, String email, String fullName, User.Role role) {
    public static CurrentUserResponse from(User user) {
        return new CurrentUserResponse(
                user.getId(), user.getEmail(), user.getFullName(), user.getRole());
    }
}
