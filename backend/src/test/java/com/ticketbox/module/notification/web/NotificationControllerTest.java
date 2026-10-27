package com.ticketbox.module.notification.web;

import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.notification.application.NotificationService;
import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.module.notification.web.dto.NotificationResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = NotificationController.class)
@Import(SecurityConfig.class)
class NotificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private NotificationService notificationService;

    @MockBean
    private JwtService jwtService;

    private final UUID userId = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private final UUID notificationId = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Test
    void listNotifications_WithAuthentication_ReturnsCurrentUserNotifications() throws Exception {
        NotificationResponse response = notificationResponse(null);
        when(notificationService.getNotifications(eq(userId), any()))
                .thenReturn(new PageImpl<>(List.of(response), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/notifications")
                        .with(authentication(auth(User.Role.AUDIENCE))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.content[0].id").value(notificationId.toString()))
                .andExpect(jsonPath("$.data.content[0].subject").value("Ticket purchased"))
                .andExpect(jsonPath("$.data.content[0].userId").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].attempts").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].lastError").doesNotExist());
    }

    @Test
    void listNotifications_WithoutAuthentication_Returns401() throws Exception {
        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.message").value("Vui lòng đăng nhập để tiếp tục"));
    }

    @Test
    void markAsRead_WithAuthentication_ReturnsUpdatedNotification() throws Exception {
        OffsetDateTime readAt = OffsetDateTime.now();
        when(notificationService.markAsRead(userId, notificationId))
                .thenReturn(notificationResponse(readAt));

        mockMvc.perform(patch("/api/notifications/{notificationId}/read", notificationId)
                        .with(authentication(auth(User.Role.AUDIENCE))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(notificationId.toString()))
                .andExpect(jsonPath("$.data.read").value(true))
                .andExpect(jsonPath("$.data.userId").doesNotExist())
                .andExpect(jsonPath("$.data.lastError").doesNotExist());
    }

    private UsernamePasswordAuthenticationToken auth(User.Role role) {
        return new UsernamePasswordAuthenticationToken(
                userId.toString(),
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }

    private NotificationResponse notificationResponse(OffsetDateTime readAt) {
        return new NotificationResponse(
                notificationId,
                Notification.Channel.APP,
                "TICKET_PURCHASED",
                "Ticket purchased",
                "Your ticket is ready.",
                Notification.Status.SENT,
                OffsetDateTime.now().minusMinutes(1),
                readAt,
                readAt != null,
                OffsetDateTime.now().minusMinutes(2)
        );
    }
}
