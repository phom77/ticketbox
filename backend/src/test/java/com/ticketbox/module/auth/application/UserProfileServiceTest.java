package com.ticketbox.module.auth.application;

import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.auth.web.dto.UpdateUserProfileRequest;
import com.ticketbox.module.auth.web.dto.UserProfileResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserProfileServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserProfileService userProfileService;

    private UUID userId;
    private User user;

    @BeforeEach
    void setUp() {
        userId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        user = new User();
        ReflectionTestUtils.setField(user, "id", userId);
        user.setEmail("audience@example.com");
        user.setFullName("Audience User");
        user.setPhone("0123456789");
        user.setPasswordHash("hashed_password");
        user.setRole(User.Role.AUDIENCE);
        user.setActive(true);
    }

    @Test
    void getProfile_ReturnsSafeCurrentUserProfile() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        UserProfileResponse response = userProfileService.getProfile(userId);

        assertEquals(userId, response.id());
        assertEquals("audience@example.com", response.email());
        assertEquals("Audience User", response.fullName());
        assertEquals("0123456789", response.phone());
        assertEquals(User.Role.AUDIENCE, response.role());
    }

    @Test
    void updateProfile_UpdatesAllowedFieldsOnly() {
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);

        UserProfileResponse response = userProfileService.updateProfile(
                userId,
                new UpdateUserProfileRequest(" Updated Name ", " 0987654321 ")
        );

        assertEquals("Updated Name", response.fullName());
        assertEquals("0987654321", response.phone());
        assertEquals(User.Role.AUDIENCE, user.getRole());
        assertEquals("hashed_password", user.getPasswordHash());
        assertEquals("audience@example.com", user.getEmail());
        verify(userRepository).save(user);
    }

    @Test
    void updateProfile_DoesNotChangeRoleActiveOrPasswordHash() {
        user.setRole(User.Role.ORGANIZER);
        user.setActive(false);
        user.setPasswordHash("original_hash");
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(userRepository.save(user)).thenReturn(user);

        userProfileService.updateProfile(userId, new UpdateUserProfileRequest("New Name", null));

        assertEquals(User.Role.ORGANIZER, user.getRole());
        assertFalse(user.isActive());
        assertEquals("original_hash", user.getPasswordHash());
    }

    @Test
    void getProfile_UserNotFound_ThrowsNotFound() {
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> userProfileService.getProfile(userId));

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
        verify(userRepository, never()).save(any(User.class));
    }
}
