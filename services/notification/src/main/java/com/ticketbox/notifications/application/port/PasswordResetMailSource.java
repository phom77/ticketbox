package com.ticketbox.notifications.application.port;

import java.util.Optional;
import java.util.UUID;

public interface PasswordResetMailSource {
    record Message(UUID id, UUID leaseId, String email, String token) {}

    Optional<Message> claim();

    void finish(UUID id, UUID leaseId, boolean delivered);
}
