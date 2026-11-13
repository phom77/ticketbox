package org.ticketbox.identity.auth;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.auth.application.AuthService;
import org.ticketbox.identity.auth.application.dto.AuthResponse;
import org.ticketbox.identity.auth.application.dto.LoginRequest;
import org.ticketbox.identity.auth.application.dto.RegisterRequest;
import org.ticketbox.identity.auth.web.AuthController;
import org.ticketbox.identity.config.SecurityConfig;
import org.ticketbox.identity.infrastructure.security.JwtService;
import org.ticketbox.identity.web.ApiMessages;

import java.util.Collections;
import java.util.Locale;
import java.util.UUID;

@WebMvcTest(controllers = AuthController.class)
@Import(SecurityConfig.class)
class AuthControllerTest {

    @Autowired private MockMvc mockMvc;

    @Autowired private ObjectMapper objectMapper;

    @Autowired private MessageSource messageSource;

    @MockBean private AuthService authService;

    @MockBean private JwtService jwtService;

    @MockBean private org.ticketbox.identity.auth.application.CurrentSession currentSession;

    @MockBean private UserRepository userRepository;

    private User sampleUser;

    @BeforeEach
    void setUp() {
        sampleUser = new User();
        org.springframework.test.util.ReflectionTestUtils.setField(
                sampleUser, "id", UUID.randomUUID());
        sampleUser.setEmail("audience@example.com");
        sampleUser.setFullName("Audience User");
        sampleUser.setPasswordHash("hashed_password");
        sampleUser.setRole(User.Role.AUDIENCE);
        sampleUser.setActive(true);
    }

    @Test
    void register_WithValidRequest_Returns201() throws Exception {
        RegisterRequest request =
                new RegisterRequest(
                        "audience@example.com", "password123", "Audience User", "123456789");
        AuthResponse.UserSummary summary =
                new AuthResponse.UserSummary(
                        sampleUser.getId(),
                        sampleUser.getEmail(),
                        sampleUser.getFullName(),
                        sampleUser.getRole());

        when(authService.register(any(RegisterRequest.class))).thenReturn(summary);

        mockMvc.perform(
                        post("/api/auth/register")
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

        mockMvc.perform(
                        post("/api/auth/register")
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
        AuthResponse.UserSummary summary =
                new AuthResponse.UserSummary(
                        sampleUser.getId(),
                        sampleUser.getEmail(),
                        sampleUser.getFullName(),
                        sampleUser.getRole());
        AuthResponse authResponse = new AuthResponse("jwt_token", "Bearer", 3600, summary);

        when(authService.login(any(LoginRequest.class))).thenReturn(authResponse);

        mockMvc.perform(
                        post("/api/auth/login")
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
    void authenticationErrorUsesRequestedLanguageBeforeMvc() throws Exception {
        mockMvc.perform(get("/api/auth/me").header("Accept-Language", "en-US"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Content-Language", "en"))
                .andExpect(
                        header().stringValues(
                                        "Vary", org.hamcrest.Matchers.hasItem("Accept-Language")))
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.message").value("Please sign in to continue"));
    }

    @Test
    void validationUsesLanguagePreferencesAndInterpolatesConstraintAttributes() throws Exception {
        RegisterRequest request =
                new RegisterRequest("invalid-email", "short", "Audience User", null);

        mockMvc.perform(
                        post("/api/auth/register")
                                .header("Accept-Language", "fr;q=1,en;q=0.8,vi;q=0.5")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(header().string("Content-Language", "en"))
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("Invalid input"))
                .andExpect(jsonPath("$.details.email").value("Invalid email address"))
                .andExpect(
                        jsonPath("$.details.password")
                                .value("Password must be at least 6 characters"));
    }

    @Test
    void securityFallsBackToTheConfiguredDefaultForMalformedAndUnsupportedLanguages()
            throws Exception {
        for (String language : new String[] {"vi-VN", "fr", "en;q=broken", "en;q=0"}) {
            mockMvc.perform(get("/api/auth/me").header("Accept-Language", language))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().string("Content-Language", "vi"))
                    .andExpect(jsonPath("$.message").value("Vui lòng đăng nhập để tiếp tục"));
        }
    }

    @Test
    void supportedLocaleWithoutATranslationUsesTheEnglishBundle() {
        var messages = new ApiMessages(messageSource, "en,vi,fr", "vi");
        var request = new MockHttpServletRequest();
        request.addHeader("Accept-Language", "fr-CA");

        Locale selected = messages.resolveLocale(request);
        org.assertj.core.api.Assertions.assertThat(selected).isEqualTo(Locale.FRENCH);
        org.assertj.core.api.Assertions.assertThat(messages.text("error.unauthenticated", selected))
                .isEqualTo("Please sign in to continue");
    }

    @Test
    void me_WithToken_Returns200() throws Exception {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                        sampleUser,
                        null,
                        Collections.singletonList(new SimpleGrantedAuthority("ROLE_AUDIENCE")));

        mockMvc.perform(get("/api/auth/me").with(authentication(auth)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("Thành công"))
                .andExpect(jsonPath("$.data.email").value("audience@example.com"))
                .andExpect(jsonPath("$.data.fullName").value("Audience User"))
                .andExpect(jsonPath("$.data.role").value("AUDIENCE"));
    }
}
