package org.ticketbox.identity.auth.application.port;

import java.util.UUID;

public interface TokenIssuer {
    String generateToken(UUID userId, String email, String role, String fullName);

    long getExpirationMs();
}
