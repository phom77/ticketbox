package org.ticketbox.identity.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.ticketbox.identity.account.application.AdminUserService;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.account.web.AdminUserController;
import org.ticketbox.identity.config.SecurityConfig;
import org.ticketbox.identity.infrastructure.security.JwtService;
import org.ticketbox.identity.web.security.SessionAccess;

import java.util.Collections;

@WebMvcTest(controllers = AdminUserController.class)
@Import({SecurityConfig.class, org.ticketbox.identity.web.GlobalExceptionHandler.class})
class SecurityHardeningTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private JwtService jwtService;

    @MockBean private UserRepository userRepository;

    @MockBean private AdminUserService adminUserService;
    @MockBean private SessionAccess sessions;

    private UsernamePasswordAuthenticationToken createAuthToken(User.Role role) {
        String userId = "11111111-1111-1111-1111-111111111111";
        return new UsernamePasswordAuthenticationToken(
                userId,
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name())));
    }

    // 1. Test admin-only endpoint with incorrect role
    @Test
    void adminUsersEndpoint_WithAudienceRole_ReturnsForbidden() throws Exception {
        mockMvc.perform(
                        get("/api/admin/users")
                                .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isForbidden());
    }

    // 2. Test admin-only endpoint without authentication
    @Test
    void adminUsersEndpoint_WithoutToken_ReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/admin/users")).andExpect(status().isUnauthorized());
    }

    // 3. Test admin-only endpoint with correct admin role
    @Test
    void adminUsersEndpoint_WithAdminRole_ReturnsOk() throws Exception {
        mockMvc.perform(
                        get("/api/admin/users")
                                .header("Authorization", "Bearer fixture")
                                .with(authentication(createAuthToken(User.Role.ADMIN))))
                .andExpect(status().isOk());
    }
}
