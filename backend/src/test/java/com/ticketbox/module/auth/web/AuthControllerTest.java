package com.ticketbox.module.auth.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.application.AuthService;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.module.auth.web.dto.AuthResponse;
import com.ticketbox.module.auth.web.dto.LoginRequest;
import com.ticketbox.module.auth.web.dto.RegisterRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.Collections;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AuthController.class)
@Import(SecurityConfig.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthService authService;

    @MockBean
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    private User sampleUser;

    @BeforeEach
    void setUp() {
        sampleUser = new User();
        org.springframework.test.util.ReflectionTestUtils.setField(sampleUser, "id", UUID.randomUUID());
        sampleUser.setEmail("audience@example.com");
        sampleUser.setFullName("Audience User");
        sampleUser.setPasswordHash("hashed_password");
        sampleUser.setRole(User.Role.AUDIENCE);
        sampleUser.setActive(true);
    }

    @Test
    void register_WithValidRequest_Returns201() throws Exception {
        RegisterRequest request = new RegisterRequest("audience@example.com", "password123", "Audience User", "123456789");
        AuthResponse.UserSummary summary = new AuthResponse.UserSummary(
                sampleUser.getId(), sampleUser.getEmail(), sampleUser.getFullName(), sampleUser.getRole()
        );

        when(authService.register(any(RegisterRequest.class))).thenReturn(summary);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value(201))
                .andExpect(jsonPath("$.message").value("Đã tạo thành công"))
                .andExpect(jsonPath("$.data.email").value("audience@example.com"))
                .andExpect(jsonPath("$.data.fullName").value("Audience User"));
    }

    @Test
    void register_WithInvalidRequest_Returns400() throws Exception {
        RegisterRequest request = new RegisterRequest("invalid-email", "", "", "");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("Dữ liệu chưa hợp lệ"))
                .andExpect(jsonPath("$.details.email").exists())
                .andExpect(jsonPath("$.details.password").exists())
                .andExpect(jsonPath("$.details.fullName").exists());
    }

    @Test
    void login_WithValidCredentials_Returns200() throws Exception {
        LoginRequest request = new LoginRequest("audience@example.com", "password123");
        AuthResponse.UserSummary summary = new AuthResponse.UserSummary(
                sampleUser.getId(), sampleUser.getEmail(), sampleUser.getFullName(), sampleUser.getRole()
        );
        AuthResponse authResponse = new AuthResponse("jwt_token", "Bearer", 3600, summary);

        when(authService.login(any(LoginRequest.class))).thenReturn(authResponse);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("Thành công"))
                .andExpect(jsonPath("$.data.accessToken").value("jwt_token"))
                .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.data.expiresIn").value(3600))
                .andExpect(jsonPath("$.data.user.email").value("audience@example.com"));
    }

    @Test
    void me_WithoutToken_Returns401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.message").value("Vui lòng đăng nhập để tiếp tục"));
    }

    @Test
    void me_WithToken_Returns200() throws Exception {
        UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                sampleUser,
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_AUDIENCE"))
        );

        mockMvc.perform(get("/api/auth/me")
                        .with(authentication(auth)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("Thành công"))
                .andExpect(jsonPath("$.data.email").value("audience@example.com"))
                .andExpect(jsonPath("$.data.fullName").value("Audience User"))
                .andExpect(jsonPath("$.data.role").value("AUDIENCE"));
    }
}
