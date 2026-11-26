package org.ticketbox.ticketing.application.port.identity;

import java.util.UUID;

/**
 * Read model for user contact data exposed by the {@code auth} module. Contains the fields needed
 * for email delivery and the account role, which decides who may receive a ticket transfer. The
 * role is {@code null} when Identity does not report it.
 */
public record UserContactView(UUID id, String email, String fullName, String role) {
    public UserContactView(UUID id, String email, String fullName) {
        this(id, email, fullName, null);
    }
}
