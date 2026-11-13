package org.ticketbox.identity.auth.application.port;

import java.util.Optional;
import java.util.UUID;

public interface PasswordResetStore {
    record Delivery(UUID id, UUID leaseId, String email, byte[] encryptedToken) {}

    boolean allow(String kind, byte[] digest, long bucket, int limit);

    void issue(UUID accountId, UUID id, long sessionVersion, byte[] digest, byte[] encryptedToken);

    Optional<UUID> findAccount(byte[] digest);

    boolean consume(UUID accountId, long sessionVersion, byte[] digest);

    Optional<Delivery> claim(UUID leaseId, long currentBucket);

    void finish(UUID id, UUID leaseId, boolean delivered);
}
