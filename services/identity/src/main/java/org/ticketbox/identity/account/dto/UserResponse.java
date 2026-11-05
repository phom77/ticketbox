package org.ticketbox.identity.account.dto;

import org.ticketbox.identity.account.User;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String phone,
        String fullName,
        User.Role role,
        boolean isActive
) {
    public static UserResponse fromEntity(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getPhone(),
                user.getFullName(),
                user.getRole(),
                user.isActive()
        );
    }
}
