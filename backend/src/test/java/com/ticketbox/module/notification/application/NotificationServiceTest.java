package com.ticketbox.module.notification.application;

import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.module.notification.domain.NotificationRepository;
import com.ticketbox.module.notification.web.dto.NotificationResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    @InjectMocks
    private NotificationService notificationService;

    private UUID userId;
    private UUID notificationId;
    private Notification notification;

    @BeforeEach
    void setUp() {
        userId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        notificationId = UUID.fromString("22222222-2222-2222-2222-222222222222");

        notification = new Notification();
        ReflectionTestUtils.setField(notification, "id", notificationId);
        ReflectionTestUtils.setField(notification, "createdAt", OffsetDateTime.now());
        notification.setUserId(userId);
        notification.setChannel(Notification.Channel.APP);
        notification.setEventType("TICKET_PURCHASED");
        notification.setSubject("Ticket purchased");
        notification.setBody("Your ticket is ready.");
        notification.setStatus(Notification.Status.SENT);
    }

    @Test
    void getNotifications_FiltersByCurrentUser() {
        PageRequest pageable = PageRequest.of(0, 20);
        when(notificationRepository.findByUserId(eq(userId), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(notification), pageable, 1));

        Page<NotificationResponse> response = notificationService.getNotifications(userId, pageable);

        assertEquals(1, response.getTotalElements());
        assertEquals(notificationId, response.getContent().getFirst().id());
        verify(notificationRepository).findByUserId(userId, pageable);
    }

    @Test
    void markAsRead_CurrentUsersNotification_SetsReadAt() {
        when(notificationRepository.findByIdAndUserId(notificationId, userId))
                .thenReturn(Optional.of(notification));

        NotificationResponse response = notificationService.markAsRead(userId, notificationId);

        assertTrue(response.read());
        assertNotNull(response.readAt());
        assertNotNull(notification.getReadAt());
    }

    @Test
    void markAsRead_AlreadyRead_IsIdempotent() {
        OffsetDateTime alreadyReadAt = OffsetDateTime.now().minusHours(1);
        notification.setReadAt(alreadyReadAt);
        when(notificationRepository.findByIdAndUserId(notificationId, userId))
                .thenReturn(Optional.of(notification));

        NotificationResponse response = notificationService.markAsRead(userId, notificationId);

        assertSame(alreadyReadAt, notification.getReadAt());
        assertEquals(alreadyReadAt, response.readAt());
    }

    @Test
    void markAsRead_OtherUsersNotification_ThrowsNotFound() {
        when(notificationRepository.findByIdAndUserId(notificationId, userId))
                .thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class,
                () -> notificationService.markAsRead(userId, notificationId));

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }
}
