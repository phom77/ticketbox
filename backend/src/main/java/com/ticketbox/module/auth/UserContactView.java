package com.ticketbox.module.auth;

import java.util.UUID;

/**
 * Read model for user contact data exposed by the {@code auth} module.
 * Contains only the fields needed for email delivery.
 */
public record UserContactView(
        UUID id,
        String email,
        String fullName
) {}
