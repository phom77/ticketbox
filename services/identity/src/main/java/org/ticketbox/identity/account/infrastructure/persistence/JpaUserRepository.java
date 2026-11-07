package org.ticketbox.identity.account.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.ticketbox.identity.account.domain.User;

import java.util.Optional;
import java.util.UUID;

public interface JpaUserRepository
        extends org.ticketbox.identity.account.application.port.UserRepository,
                JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}
