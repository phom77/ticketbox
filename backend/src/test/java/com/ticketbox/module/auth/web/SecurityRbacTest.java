package com.ticketbox.module.auth.web;

import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.infrastructure.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.context.annotation.Profile;
import org.springframework.test.context.ActiveProfiles;

import java.util.Collections;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@RestController
@Profile("rbac-slice")
class TestAdminController {
    @GetMapping("/api/admin/test")
    public String adminTest() {
        return "admin-ok";
    }
    @GetMapping("/api/admin/users/test")
    public String adminUsersTest() {
        return "admin-users-ok";
    }
}

@RestController
@Profile("rbac-slice")
class TestStaffController {
    @GetMapping("/api/staff/test")
    public String staffTest() {
        return "staff-ok";
    }
}

@RestController
@Profile("rbac-slice")
class TestOrganizerController {
    @GetMapping("/api/organizer/manage/test")
    public String organizerTest() {
        return "organizer-ok";
    }
}

@RestController
@Profile("rbac-slice")
class TestAudienceProtectedController {
    @GetMapping("/api/orders")
    public String orders() {
        return "orders-ok";
    }

    @GetMapping("/api/tickets")
    public String tickets() {
        return "tickets-ok";
    }

    @GetMapping("/api/payments/{orderId}/status")
    public String paymentStatus(@PathVariable UUID orderId) {
        return "payment-status-ok";
    }

    @PostMapping("/api/payments/{orderId}/initiate")
    public String initiatePayment(@PathVariable UUID orderId) {
        return "payment-initiate-ok";
    }

    @PostMapping("/api/payments/webhooks/vnpay")
    public String paymentWebhook() {
        return "webhook-ok";
    }

    @PostMapping("/api/mock-payments/{orderId}/success")
    public String mockPaymentSuccess(@PathVariable UUID orderId) {
        return "mock-payment-ok";
    }
}

@RestController
@Profile("rbac-slice")
class TestReservationController {
    @GetMapping("/api/reservations/concerts/11111111-1111-1111-1111-111111111111/holds")
    public String holds() {
        return "holds-ok";
    }
}

@WebMvcTest(controllers = {
    TestAdminController.class,
    TestStaffController.class,
    TestOrganizerController.class,
    TestAudienceProtectedController.class,
    TestReservationController.class
})
@Import(SecurityConfig.class)
@ActiveProfiles("rbac-slice")
class SecurityRbacTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    private UsernamePasswordAuthenticationToken createAuthToken(User.Role role) {
        User user = new User();
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", UUID.fromString("11111111-1111-1111-1111-111111111111"));
        user.setEmail(role.name().toLowerCase() + "@example.com");
        user.setRole(role);
        user.setActive(true);

        return new UsernamePasswordAuthenticationToken(
                user,
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }

    @Test
    void adminEndpoint_WithAudience_Returns403() throws Exception {
        mockMvc.perform(get("/api/admin/test")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminEndpoint_WithAdmin_Returns200() throws Exception {
        mockMvc.perform(get("/api/admin/test")
                        .with(authentication(createAuthToken(User.Role.ADMIN))))
                .andExpect(status().isOk());
    }

    @Test
    void adminEndpoint_WithOrganizer_Returns200() throws Exception {
        mockMvc.perform(get("/api/admin/test")
                        .with(authentication(createAuthToken(User.Role.ORGANIZER))))
                .andExpect(status().isOk());
    }

    @Test
    void adminUsersEndpoint_WithOrganizer_Returns403() throws Exception {
        mockMvc.perform(get("/api/admin/users/test")
                        .with(authentication(createAuthToken(User.Role.ORGANIZER))))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminUsersEndpoint_WithAdmin_Returns200() throws Exception {
        mockMvc.perform(get("/api/admin/users/test")
                        .with(authentication(createAuthToken(User.Role.ADMIN))))
                .andExpect(status().isOk());
    }

    @Test
    void organizerEndpoint_WithOrganizer_Returns200() throws Exception {
        mockMvc.perform(get("/api/organizer/manage/test")
                        .with(authentication(createAuthToken(User.Role.ORGANIZER))))
                .andExpect(status().isOk());
    }

    @Test
    void organizerEndpoint_WithAdmin_Returns403() throws Exception {
        mockMvc.perform(get("/api/organizer/manage/test")
                        .with(authentication(createAuthToken(User.Role.ADMIN))))
                .andExpect(status().isForbidden());
    }

    @Test
    void staffEndpoint_WithAudience_Returns403() throws Exception {
        mockMvc.perform(get("/api/staff/test")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isForbidden());
    }

    @Test
    void staffEndpoint_WithStaff_Returns200() throws Exception {
        mockMvc.perform(get("/api/staff/test")
                        .with(authentication(createAuthToken(User.Role.STAFF))))
                .andExpect(status().isOk());
    }

    @Test
    void ordersEndpoint_WithoutToken_Returns401() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void ticketsEndpoint_WithoutToken_Returns401() throws Exception {
        mockMvc.perform(get("/api/tickets"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void paymentStatusEndpoint_WithoutToken_Returns401() throws Exception {
        mockMvc.perform(get("/api/payments/11111111-1111-1111-1111-111111111111/status"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void audienceProtectedEndpoints_WithAudience_Return200() throws Exception {
        UsernamePasswordAuthenticationToken audience = createAuthToken(User.Role.AUDIENCE);

        mockMvc.perform(get("/api/orders").with(authentication(audience)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/tickets").with(authentication(audience)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/payments/11111111-1111-1111-1111-111111111111/status").with(authentication(audience)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/payments/11111111-1111-1111-1111-111111111111/initiate").with(authentication(audience)))
                .andExpect(status().isOk());
    }

    @Test
    void audienceProtectedEndpoints_WithNonAudience_Return403() throws Exception {
        UsernamePasswordAuthenticationToken staff = createAuthToken(User.Role.STAFF);

        mockMvc.perform(get("/api/orders").with(authentication(staff)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/tickets").with(authentication(staff)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/payments/11111111-1111-1111-1111-111111111111/status").with(authentication(staff)))
                .andExpect(status().isForbidden());
    }

    @Test
    void paymentWebhook_WithoutToken_Returns200() throws Exception {
        mockMvc.perform(post("/api/payments/webhooks/vnpay"))
                .andExpect(status().isOk());
    }

    @Test
    void mockPayment_WithoutToken_Returns401() throws Exception {
        mockMvc.perform(post("/api/mock-payments/11111111-1111-1111-1111-111111111111/success"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reservationsEndpoint_WithoutToken_Returns401() throws Exception {
        mockMvc.perform(get("/api/reservations/concerts/11111111-1111-1111-1111-111111111111/holds"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reservationsEndpoint_WithAudience_Returns200() throws Exception {
        mockMvc.perform(get("/api/reservations/concerts/11111111-1111-1111-1111-111111111111/holds")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isOk());
    }

    @Test
    void reservationsEndpoint_WithStaff_Returns403() throws Exception {
        mockMvc.perform(get("/api/reservations/concerts/11111111-1111-1111-1111-111111111111/holds")
                        .with(authentication(createAuthToken(User.Role.STAFF))))
                .andExpect(status().isForbidden());
    }
}
