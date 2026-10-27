package com.ticketbox.module.auth.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.application.UserProfileService;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.web.dto.UpdateUserProfileRequest;
import com.ticketbox.module.auth.web.dto.UserProfileResponse;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = UserProfileController.class)
@Import(SecurityConfig.class)
class UserProfileControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserProfileService userProfileService;

    @MockBean
    private JwtService jwtService;

    private final UUID userId = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Test
    void getProfile_WithAuthentication_ReturnsProfile() throws Exception {
        when(userProfileService.getProfile(userId)).thenReturn(profile("Audience User", "0123456789", User.Role.AUDIENCE));

        mockMvc.perform(get("/api/users/me/profile")
                        .with(authentication(auth(User.Role.AUDIENCE))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.email").value("audience@example.com"))
                .andExpect(jsonPath("$.data.fullName").value("Audience User"))
                .andExpect(jsonPath("$.data.phone").value("0123456789"))
                .andExpect(jsonPath("$.data.role").value("AUDIENCE"))
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.data.isActive").doesNotExist());
    }

    @Test
    void getProfile_WithoutAuthentication_Returns401() throws Exception {
        mockMvc.perform(get("/api/users/me/profile"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.message").value("Vui lòng đăng nhập để tiếp tục"));
    }

    @Test
    void updateProfile_WithAllowedFields_ReturnsUpdatedProfile() throws Exception {
        UpdateUserProfileRequest request = new UpdateUserProfileRequest("Updated User", "0987654321");
        when(userProfileService.updateProfile(eq(userId), any(UpdateUserProfileRequest.class)))
                .thenReturn(profile("Updated User", "0987654321", User.Role.AUDIENCE));

        mockMvc.perform(patch("/api/users/me/profile")
                        .with(authentication(auth(User.Role.AUDIENCE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.fullName").value("Updated User"))
                .andExpect(jsonPath("$.data.phone").value("0987654321"))
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist());
    }

    @Test
    void updateProfile_WithSensitiveFields_DoesNotBindSensitiveFields() throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("fullName", "Updated User");
        payload.put("phone", "0987654321");
        payload.put("role", "ADMIN");
        payload.put("isActive", false);
        payload.put("passwordHash", "attacker_hash");

        when(userProfileService.updateProfile(eq(userId), any(UpdateUserProfileRequest.class)))
                .thenReturn(profile("Updated User", "0987654321", User.Role.AUDIENCE));

        mockMvc.perform(patch("/api/users/me/profile")
                        .with(authentication(auth(User.Role.AUDIENCE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("AUDIENCE"))
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.data.isActive").doesNotExist());

        ArgumentCaptor<UpdateUserProfileRequest> captor = ArgumentCaptor.forClass(UpdateUserProfileRequest.class);
        verify(userProfileService).updateProfile(eq(userId), captor.capture());
        assertEquals("Updated User", captor.getValue().fullName());
        assertEquals("0987654321", captor.getValue().phone());
    }

    @Test
    void updateProfile_WithValidationError_ReturnsStandardErrorResponse() throws Exception {
        UpdateUserProfileRequest request = new UpdateUserProfileRequest("x".repeat(256), "0123456789");

        mockMvc.perform(patch("/api/users/me/profile")
                        .with(authentication(auth(User.Role.AUDIENCE)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("Dữ liệu chưa hợp lệ"))
                .andExpect(jsonPath("$.details.fullName").exists());
    }

    private UsernamePasswordAuthenticationToken auth(User.Role role) {
        return new UsernamePasswordAuthenticationToken(
                userId.toString(),
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }

    private UserProfileResponse profile(String fullName, String phone, User.Role role) {
        return new UserProfileResponse(
                userId,
                "audience@example.com",
                fullName,
                phone,
                role
        );
    }
}
