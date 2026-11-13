package org.ticketbox.identity.application.port;

import java.util.Optional;
import java.util.UUID;

public interface UserContactPort {
    Optional<UserContactView> findById(UUID userId);

    Optional<UUID> findAccountIdByEmail(String email);
}
