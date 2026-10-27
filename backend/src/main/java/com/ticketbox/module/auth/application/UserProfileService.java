package com.ticketbox.module.auth.application;

import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.auth.web.dto.UpdateUserProfileRequest;
import com.ticketbox.module.auth.web.dto.UserProfileResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserProfileService {

    private final UserRepository userRepository;

    public UserProfileResponse getProfile(UUID userId) {
        return UserProfileResponse.from(getUserOrThrow(userId));
    }

    @Transactional
    public UserProfileResponse updateProfile(UUID userId, UpdateUserProfileRequest request) {
        User user = getUserOrThrow(userId);

        if (request.fullName() != null) {
            user.setFullName(request.fullName().trim());
        }
        if (request.phone() != null) {
            user.setPhone(request.phone().trim());
        }

        User saved = userRepository.save(user);
        return UserProfileResponse.from(saved);
    }

    private User getUserOrThrow(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy người dùng"));
    }
}
