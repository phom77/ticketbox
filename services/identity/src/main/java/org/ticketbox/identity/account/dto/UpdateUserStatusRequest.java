package org.ticketbox.identity.account.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateUserStatusRequest(
        @NotNull(message = "Vui lòng chọn trạng thái tài khoản")
        Boolean isActive
) {}
