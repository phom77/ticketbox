package org.ticketbox.identity.application.port;

import java.util.UUID;

/** Contact payload used by other services for email delivery. */
public record UserContactView(UUID id, String email, String fullName) {}
