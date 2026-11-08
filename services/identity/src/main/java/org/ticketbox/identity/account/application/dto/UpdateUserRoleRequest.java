package org.ticketbox.identity.account.application.dto;

import jakarta.validation.constraints.NotNull;

import org.ticketbox.identity.account.domain.User;

public record UpdateUserRoleRequest(
        @NotNull(message = "{validation.account.role-required}") User.Role role) {}
