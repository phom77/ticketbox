package org.ticketbox.identity.auth.application.port;

import java.util.Optional;
import java.util.UUID;

public interface SessionReader {
    record Session(UUID accountId, long version) {}

    Optional<Session> read(String token);
}
