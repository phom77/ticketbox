package com.ticketbox.module.auth.application;

import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.module.auth.web.dto.AuthResponse;
import com.ticketbox.module.auth.web.dto.LoginRequest;
import com.ticketbox.module.auth.web.dto.RegisterRequest;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthService authService;

    private User sampleUser;
    private RegisterRequest registerRequest;
    private LoginRequest loginRequest;

    @BeforeEach
    void setUp() {
        sampleUser = new User();
        org.springframework.test.util.ReflectionTestUtils.setField(sampleUser, "id", UUID.randomUUID());
        sampleUser.setEmail("test@example.com");
        sampleUser.setFullName("Test User");
        sampleUser.setPasswordHash("hashed_password");
        sampleUser.setRole(User.Role.AUDIENCE);
        sampleUser.setActive(true);

        registerRequest = new RegisterRequest("test@example.com", "password123", "Test User", "123456789");
        loginRequest = new LoginRequest("test@example.com", "password123");
    }

    @Test
    void register_Success() {
        when(userRepository.existsByEmail(registerRequest.email())).thenReturn(false);
        when(passwordEncoder.encode(registerRequest.password())).thenReturn("hashed_password");
        when(userRepository.save(any(User.class))).thenReturn(sampleUser);

        AuthResponse.UserSummary summary = authService.register(registerRequest);

        assertNotNull(summary);
        assertEquals(sampleUser.getId(), summary.id());
        assertEquals(sampleUser.getEmail(), summary.email());
        assertEquals(sampleUser.getFullName(), summary.fullName());
        assertEquals(User.Role.AUDIENCE, summary.role());

        verify(userRepository).existsByEmail(registerRequest.email());
        verify(passwordEncoder).encode(registerRequest.password());
        verify(userRepository).save(any(User.class));
    }

    @Test
    void register_DuplicateEmail_ThrowsException() {
        when(userRepository.existsByEmail(registerRequest.email())).thenReturn(true);

        AppException ex = assertThrows(AppException.class, () -> authService.register(registerRequest));
        assertEquals(ErrorCode.EMAIL_ALREADY_EXISTS, ex.getErrorCode());

        verify(userRepository).existsByEmail(registerRequest.email());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void login_Success() {
        when(userRepository.findByEmail(loginRequest.email())).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches(loginRequest.password(), sampleUser.getPasswordHash())).thenReturn(true);
        when(jwtService.generateToken(
                eq(sampleUser.getId()),
                eq(sampleUser.getEmail()),
                eq(sampleUser.getRole().name()),
                eq(sampleUser.getFullName())
        )).thenReturn("jwt_token");
        when(jwtService.getExpirationMs()).thenReturn(3600000L); // 1 hour

        AuthResponse response = authService.login(loginRequest);

        assertNotNull(response);
        assertEquals("jwt_token", response.accessToken());
        assertEquals("Bearer", response.tokenType());
        assertEquals(3600, response.expiresIn());
        assertEquals(sampleUser.getId(), response.user().id());

        verify(userRepository).findByEmail(loginRequest.email());
        verify(passwordEncoder).matches(loginRequest.password(), sampleUser.getPasswordHash());
        verify(jwtService).generateToken(
                eq(sampleUser.getId()),
                eq(sampleUser.getEmail()),
                eq(sampleUser.getRole().name()),
                eq(sampleUser.getFullName())
        );
    }

    @Test
    void login_UserNotFound_ThrowsException() {
        when(userRepository.findByEmail(loginRequest.email())).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> authService.login(loginRequest));
        assertEquals(ErrorCode.UNAUTHENTICATED, ex.getErrorCode());

        verify(userRepository).findByEmail(loginRequest.email());
        verify(passwordEncoder, never()).matches(anyString(), anyString());
    }

    @Test
    void login_InvalidPassword_ThrowsException() {
        when(userRepository.findByEmail(loginRequest.email())).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches(loginRequest.password(), sampleUser.getPasswordHash())).thenReturn(false);

        AppException ex = assertThrows(AppException.class, () -> authService.login(loginRequest));
        assertEquals(ErrorCode.UNAUTHENTICATED, ex.getErrorCode());

        verify(userRepository).findByEmail(loginRequest.email());
        verify(passwordEncoder).matches(loginRequest.password(), sampleUser.getPasswordHash());
    }

    @Test
    void login_InactiveUser_ThrowsException() {
        sampleUser.setActive(false);
        when(userRepository.findByEmail(loginRequest.email())).thenReturn(Optional.of(sampleUser));

        AppException ex = assertThrows(AppException.class, () -> authService.login(loginRequest));
        assertEquals(ErrorCode.UNAUTHENTICATED, ex.getErrorCode());

        verify(userRepository).findByEmail(loginRequest.email());
        verify(passwordEncoder, never()).matches(anyString(), anyString());
    }
}
