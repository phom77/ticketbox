package com.ticketbox.module.auth.web;

import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.module.auth.application.AdminUserService;
import com.ticketbox.module.ticket.application.ReservationService;
import com.ticketbox.module.ticket.domain.TicketHold;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = {
        AdminUserController.class,
        com.ticketbox.module.ticket.web.ReservationController.class
})
@Import({SecurityConfig.class, com.ticketbox.shared.exception.GlobalExceptionHandler.class})
class SecurityHardeningTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    @MockBean
    private ReservationService reservationService;

    @MockBean
    private AdminUserService adminUserService;

    private UsernamePasswordAuthenticationToken createAuthToken(User.Role role) {
        String userId = "11111111-1111-1111-1111-111111111111";
        return new UsernamePasswordAuthenticationToken(
                userId,
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }

    // 1. Test admin-only endpoint with incorrect role
    @Test
    void adminUsersEndpoint_WithAudienceRole_ReturnsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/users")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isForbidden());
    }

    // 2. Test admin-only endpoint without authentication
    @Test
    void adminUsersEndpoint_WithoutToken_ReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized());
    }

    // 3. Test admin-only endpoint with correct admin role
    @Test
    void adminUsersEndpoint_WithAdminRole_ReturnsOk() throws Exception {
        mockMvc.perform(get("/api/admin/users")
                        .with(authentication(createAuthToken(User.Role.ADMIN))))
                .andExpect(status().isOk());
    }

    // 4. Test reserve with valid queue token
    @Test
    void reserveEndpoint_WithValidQueueToken_ReturnsOk() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID ticketTypeId = UUID.randomUUID();
        TicketHold hold = new TicketHold();
        hold.setConcertId(concertId);
        hold.setTicketTypeId(ticketTypeId);
        hold.setQuantity(1);
        hold.setExpiresAt(OffsetDateTime.now().plusMinutes(10));

        when(reservationService.reserve(eq(concertId), eq(ticketTypeId), anyInt(), any(), anyString()))
                .thenReturn(hold);

        mockMvc.perform(post("/api/reservations/concerts/" + concertId + "/ticket-types/" + ticketTypeId + "/reserve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\": 1}")
                        .header("Queue-Access-Token", "valid-queue-token")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ticketTypeId").value(ticketTypeId.toString()))
                .andExpect(jsonPath("$.data.quantity").value(1));
    }

    // 5. Test reserve with expired or fake queue token (throwing UNAUTHORIZED)
    @Test
    void reserveEndpoint_WithFakeOrExpiredQueueToken_ReturnsForbidden() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID ticketTypeId = UUID.randomUUID();

        when(reservationService.reserve(eq(concertId), eq(ticketTypeId), anyInt(), any(), anyString()))
                .thenThrow(new AppException(ErrorCode.UNAUTHORIZED, "Phiên mua vé của bạn đã hết hạn"));

        mockMvc.perform(post("/api/reservations/concerts/" + concertId + "/ticket-types/" + ticketTypeId + "/reserve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\": 1}")
                        .header("Queue-Access-Token", "fake-or-expired-token")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Phiên mua vé của bạn đã hết hạn"));
    }

    // 6. Test reserve when sold out (conflict status 409)
    @Test
    void reserveEndpoint_WhenSoldOut_ReturnsConflict() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID ticketTypeId = UUID.randomUUID();

        when(reservationService.reserve(eq(concertId), eq(ticketTypeId), anyInt(), any(), anyString()))
                .thenThrow(new AppException(ErrorCode.TICKET_SOLD_OUT, "Vé đã bán hết"));

        mockMvc.perform(post("/api/reservations/concerts/" + concertId + "/ticket-types/" + ticketTypeId + "/reserve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\": 1}")
                        .header("Queue-Access-Token", "valid-token")
                        .with(authentication(createAuthToken(User.Role.AUDIENCE))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Vé đã bán hết"));
    }
}
