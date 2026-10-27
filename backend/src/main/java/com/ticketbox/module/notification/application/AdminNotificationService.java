package com.ticketbox.module.notification.application;

import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.module.notification.domain.NotificationRepository;
import com.ticketbox.module.notification.infrastructure.EmailNotificationPublisher;
import com.ticketbox.module.notification.web.dto.NotificationResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class AdminNotificationService {

    private final NotificationRepository notificationRepository;
    private final EmailNotificationPublisher emailNotificationPublisher;
    private final ConcertReminderScheduler concertReminderScheduler;

    public Page<NotificationResponse> listNotifications(Pageable pageable) {
        return notificationRepository.findAll(pageable).map(NotificationResponse::from);
    }

    @Transactional
    public NotificationResponse retryEmailNotification(UUID notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy thông báo"));

        if (notification.getChannel() != Notification.Channel.EMAIL) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Chỉ có thể gửi lại thông báo EMAIL");
        }

        notification.setStatus(Notification.Status.PENDING);
        notification.setLastError(null);
        Notification saved = notificationRepository.save(notification);
        emailNotificationPublisher.publishEmailNotification(saved.getId());
        return NotificationResponse.from(saved);
    }

    public int sendConcertReminder(UUID concertId) {
        return concertReminderScheduler.sendReminderForConcert(concertId);
    }
}
