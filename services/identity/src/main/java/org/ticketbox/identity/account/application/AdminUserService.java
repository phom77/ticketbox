package org.ticketbox.identity.account.application;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.dto.UserResponse;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminUserService {

    private final UserRepository userRepository;
    private final org.ticketbox.identity.account.application.port.AccountAccessAudit audit;

    public Page<UserResponse> listUsers(Pageable pageable) {
        return userRepository.findAll(pageable).map(UserResponse::fromEntity);
    }

    public UserResponse getUserDetail(UUID id) {
        User user =
                userRepository
                        .findById(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.user.not-found"));
        return UserResponse.fromEntity(user);
    }

    @Transactional
    public UserResponse updateUserRole(UUID actor, UUID id, User.Role role) {
        User user =
                userRepository
                        .findByIdForUpdate(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.user.not-found"));
        if (user.getRole() != role) {
            user.changeRole(role);
            audit.record(actor, id, "ROLE_CHANGED", role.name());
        }
        return UserResponse.fromEntity(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUserStatus(UUID actor, UUID id, boolean isActive) {
        User user =
                userRepository
                        .findByIdForUpdate(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.user.not-found"));
        if (user.isActive() != isActive) {
            user.changeActivity(isActive);
            audit.record(actor, id, "STATUS_CHANGED", Boolean.toString(isActive));
        }
        return UserResponse.fromEntity(userRepository.save(user));
    }
}
