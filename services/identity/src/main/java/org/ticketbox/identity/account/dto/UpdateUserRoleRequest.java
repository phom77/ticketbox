package org.ticketbox.identity.account.dto;

import org.ticketbox.identity.account.User;
import jakarta.validation.constraints.NotNull;

public record UpdateUserRoleRequest(
        @NotNull(message = "Vui lòng chọn vai trò")
        User.Role role
) {}
