package org.ticketbox.identity.account.infrastructure.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.ticketbox.identity.account.domain.User;

import java.util.Optional;
import java.util.UUID;

public interface JpaUserRepository
        extends org.ticketbox.identity.account.application.port.UserRepository,
                JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);

    @Override
    @Query(value = "SELECT * FROM users WHERE lower(email)=lower(:email) ORDER BY id LIMIT 2", nativeQuery = true)
    java.util.List<User> findTop2ByEmailIgnoreCase(String email);

    boolean existsByEmail(String email);

    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :id")
    Optional<User> findByIdForUpdate(UUID id);
}
