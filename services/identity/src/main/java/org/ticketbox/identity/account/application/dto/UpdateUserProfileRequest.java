package org.ticketbox.identity.account.application.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateUserProfileRequest(
        @Size(max = 255, message = "{validation.full-name.max-size}")
                @Pattern(regexp = ".*\\S.*", message = "{validation.full-name.blank}")
                String fullName,
        @Size(max = 20, message = "{validation.phone.max-size}") String phone) {}
