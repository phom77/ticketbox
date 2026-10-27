package com.ticketbox.module.auth.infrastructure;

import com.ticketbox.module.auth.UserContactPort;
import com.ticketbox.module.auth.UserContactView;
import com.ticketbox.module.auth.domain.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class UserContactAdapter implements UserContactPort {

    private final UserRepository userRepository;

    @Override
    public Optional<UserContactView> findById(UUID userId) {
        return userRepository.findById(userId)
                .filter(u -> u.isActive())
                .map(u -> new UserContactView(u.getId(), u.getEmail(), u.getFullName()));
    }
}
