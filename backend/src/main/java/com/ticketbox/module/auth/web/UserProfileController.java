package com.ticketbox.module.auth.web;

import com.ticketbox.module.auth.application.UserProfileService;
import com.ticketbox.module.auth.web.dto.UpdateUserProfileRequest;
import com.ticketbox.module.auth.web.dto.UserProfileResponse;
import com.ticketbox.shared.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/users/me/profile")
@RequiredArgsConstructor
public class UserProfileController {

    private final UserProfileService userProfileService;

    @GetMapping
    public ResponseEntity<ApiResponse<UserProfileResponse>> getProfile(Authentication authentication) {
        UserProfileResponse profile = userProfileService.getProfile(currentUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success(profile));
    }

    @PatchMapping
    public ResponseEntity<ApiResponse<UserProfileResponse>> updateProfile(
            Authentication authentication,
            @Valid @RequestBody UpdateUserProfileRequest request
    ) {
        UserProfileResponse profile = userProfileService.updateProfile(currentUserId(authentication), request);
        return ResponseEntity.ok(ApiResponse.success(profile));
    }

    private UUID currentUserId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
