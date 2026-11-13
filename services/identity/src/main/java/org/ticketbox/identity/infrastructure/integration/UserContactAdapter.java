package org.ticketbox.identity.infrastructure.integration;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Component;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.port.UserContactView;

import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class UserContactAdapter implements org.ticketbox.identity.application.port.UserContactPort {

    private final UserRepository userRepository;

    public Optional<UserContactView> findById(UUID userId) {
        return userRepository
                .findById(userId)
                .filter(User::isActive)
                .map(u -> new UserContactView(u.getId(), u.getEmail(), u.getFullName()));
    }

    @Override
    public Optional<UUID> findAccountIdByEmail(String email) {
        var matches = userRepository.findTop2ByEmailIgnoreCase(email.strip());
        return matches.size() == 1 ? Optional.of(matches.getFirst().getId()) : Optional.empty();
    }
}
