package com.ticketbox.module.auth.web;

import com.ticketbox.module.auth.application.AuthService;
import com.ticketbox.module.auth.web.dto.AuthResponse;
import com.ticketbox.module.auth.web.dto.CurrentUserResponse;
import com.ticketbox.module.auth.web.dto.LoginRequest;
import com.ticketbox.module.auth.web.dto.RegisterRequest;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse.UserSummary>> register(
            @Valid @RequestBody RegisterRequest request
    ) {
        AuthResponse.UserSummary userSummary = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.created(userSummary));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request
    ) {
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
        } else if (principal instanceof com.ticketbox.module.auth.domain.User user) {
            // Test mock flow: SecurityMockMvcRequestPostProcessors sets principal as User
            response = com.ticketbox.module.auth.web.dto.CurrentUserResponse.from(user);
        } else {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
