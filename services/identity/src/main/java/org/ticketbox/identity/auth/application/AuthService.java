package org.ticketbox.identity.auth.application;

import lombok.RequiredArgsConstructor;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.auth.application.dto.AuthResponse;
import org.ticketbox.identity.auth.application.dto.CurrentUserResponse;
import org.ticketbox.identity.auth.application.dto.LoginRequest;
import org.ticketbox.identity.auth.application.dto.RegisterRequest;
import org.ticketbox.identity.auth.application.port.TokenIssuer;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenIssuer jwtService;

    @Transactional
    public AuthResponse.UserSummary register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS, "error.email-already-exists");
        }

        User user =
                User.register(
                        request.email(),
                        request.fullName(),
                        passwordEncoder.encode(request.password()),
                        request.phone());

        User savedUser = userRepository.save(user);

        return new AuthResponse.UserSummary(
                savedUser.getId(),
                savedUser.getEmail(),
                savedUser.getFullName(),
                savedUser.getRole());
    }

    public AuthResponse login(LoginRequest request) {
        User user =
                userRepository
                        .findByEmail(request.email())
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.UNAUTHENTICATED,
                                                "error.auth.invalid-credentials"));

        if (!user.isActive()) {
            throw new AppException(ErrorCode.UNAUTHENTICATED, "error.auth.account-disabled");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.UNAUTHENTICATED, "error.auth.invalid-credentials");
        }

        String token =
                jwtService.generateToken(
                        user.getId(), user.getEmail(), user.getRole().name(), user.getFullName());
        long expiresIn = jwtService.getExpirationMs() / 1000; // in seconds

        AuthResponse.UserSummary userSummary =
                new AuthResponse.UserSummary(
                        user.getId(), user.getEmail(), user.getFullName(), user.getRole());

        return new AuthResponse(token, "Bearer", expiresIn, userSummary);
    }

    public CurrentUserResponse getCurrentUser(UUID userId) {
        User user =
                userRepository
                        .findById(userId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.UNAUTHENTICATED, "error.user.not-found"));
        return CurrentUserResponse.from(user);
    }
}
