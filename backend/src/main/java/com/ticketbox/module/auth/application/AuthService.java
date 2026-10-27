package com.ticketbox.module.auth.application;

import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.module.auth.web.dto.AuthResponse;
import com.ticketbox.module.auth.web.dto.CurrentUserResponse;
import com.ticketbox.module.auth.web.dto.LoginRequest;
import com.ticketbox.module.auth.web.dto.RegisterRequest;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional
    public AuthResponse.UserSummary register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email đã được đăng ký");
        }

        User user = new User();
        user.setEmail(request.email());
        user.setFullName(request.fullName());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setPhone(request.phone());
        user.setRole(User.Role.AUDIENCE); 
        user.setActive(true);

        User savedUser = userRepository.save(user);

        return new AuthResponse.UserSummary(
                savedUser.getId(),
                savedUser.getEmail(),
                savedUser.getFullName(),
                savedUser.getRole()
        );
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED, "Email hoặc mật khẩu không đúng"));

        if (!user.isActive()) {
            throw new AppException(ErrorCode.UNAUTHENTICATED, "Tài khoản đã bị vô hiệu hóa");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new AppException(ErrorCode.UNAUTHENTICATED, "Email hoặc mật khẩu không đúng");
        }

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getFullName());
        long expiresIn = jwtService.getExpirationMs() / 1000; // in seconds

        AuthResponse.UserSummary userSummary = new AuthResponse.UserSummary(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole()
        );

        return new AuthResponse(token, "Bearer", expiresIn, userSummary);
    }

    public CurrentUserResponse getCurrentUser(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHENTICATED, "Không tìm thấy người dùng"));
        return CurrentUserResponse.from(user);
    }
}
