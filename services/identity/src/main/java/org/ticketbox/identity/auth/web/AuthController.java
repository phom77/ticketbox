package org.ticketbox.identity.auth.web;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.auth.application.AuthService;
import org.ticketbox.identity.auth.application.dto.AuthResponse;
import org.ticketbox.identity.auth.application.dto.CurrentUserResponse;
import org.ticketbox.identity.auth.application.dto.LoginRequest;
import org.ticketbox.identity.auth.application.dto.RegisterRequest;
import org.ticketbox.identity.web.ApiResponse;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse.UserSummary>> register(
            @Valid @RequestBody RegisterRequest request) {
        AuthResponse.UserSummary userSummary = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(userSummary));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<CurrentUserResponse>> me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Object principal = authentication.getPrincipal();
        CurrentUserResponse response;

        if (principal instanceof String userId) {
            // JWT flow: JwtAuthenticationFilter sets principal as userId (String)
            response = authService.getCurrentUser(UUID.fromString(userId));
        } else if (principal instanceof User user) {
            response = CurrentUserResponse.from(user);
        } else {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
