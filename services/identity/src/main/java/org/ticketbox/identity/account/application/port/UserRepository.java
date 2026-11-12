package org.ticketbox.identity.account.application.port;

import org.ticketbox.identity.account.domain.User;

import java.util.Optional;

public interface UserRepository {
    org.springframework.data.domain.Page<User> findAll(
            org.springframework.data.domain.Pageable pageable);

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    <S extends User> S save(S entity);

    <S extends User> java.util.List<S> saveAll(Iterable<S> entities);

    java.util.Optional<User> findById(java.util.UUID id);

    Optional<User> findByIdForUpdate(java.util.UUID id);

    void delete(User entity);

    void deleteById(java.util.UUID id);

    void flush();
}
