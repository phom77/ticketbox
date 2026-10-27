package com.ticketbox.module.auth.web.dto;

import com.ticketbox.module.auth.domain.User;

import java.util.UUID;

public record UserProfileResponse(
        UUID id,
        String email,
        String fullName,
        String phone,
        User.Role role
) {
    public static UserProfileResponse from(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getPhone(),
                user.getRole()
        );
    }
}
