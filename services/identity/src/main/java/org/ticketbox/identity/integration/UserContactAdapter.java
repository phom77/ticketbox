package org.ticketbox.identity.integration;

import org.ticketbox.identity.account.User;
import org.ticketbox.identity.account.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class UserContactAdapter {

    private final UserRepository userRepository;

    public Optional<UserContactView> findById(UUID userId) {
        return userRepository.findById(userId)
                .filter(User::isActive)
                .map(u -> new UserContactView(u.getId(), u.getEmail(), u.getFullName()));
    }
}
