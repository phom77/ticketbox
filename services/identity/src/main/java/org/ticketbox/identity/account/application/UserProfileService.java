package org.ticketbox.identity.account.application;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.dto.UpdateUserProfileRequest;
import org.ticketbox.identity.account.application.dto.UserProfileResponse;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;

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

        user.updateProfile(request.fullName(), request.phone());

        User saved = userRepository.save(user);
        return UserProfileResponse.from(saved);
    }

    private User getUserOrThrow(UUID userId) {
        return userRepository
                .findById(userId)
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "error.user.not-found"));
    }
}
