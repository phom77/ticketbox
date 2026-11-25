package org.ticketbox.identity.application.port;

import java.util.UUID;

/** Contact payload used by other services for email delivery and transfer eligibility. */
public record UserContactView(UUID id, String email, String fullName, String role) {}
