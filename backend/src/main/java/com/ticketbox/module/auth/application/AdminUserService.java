package com.ticketbox.module.auth.application;

import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.auth.web.dto.UserResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminUserService {

    private final UserRepository userRepository;

    public Page<UserResponse> listUsers(Pageable pageable) {
        return userRepository.findAll(pageable).map(UserResponse::fromEntity);
    }

    public UserResponse getUserDetail(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy người dùng"));
        return UserResponse.fromEntity(user);
    }

    @Transactional
    public UserResponse updateUserRole(UUID id, User.Role role) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy người dùng"));
        user.setRole(role);
        return UserResponse.fromEntity(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUserStatus(UUID id, boolean isActive) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy người dùng"));
        user.setActive(isActive);
        return UserResponse.fromEntity(userRepository.save(user));
    }
}
