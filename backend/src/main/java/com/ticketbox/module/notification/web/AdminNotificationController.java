package com.ticketbox.module.notification.web;

import com.ticketbox.module.notification.application.AdminNotificationService;
import com.ticketbox.module.notification.web.dto.NotificationResponse;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class AdminNotificationController {

    private final AdminNotificationService adminNotificationService;

    @GetMapping("/notifications")
    public ResponseEntity<ApiResponse<Page<NotificationResponse>>> listNotifications(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return ResponseEntity.ok(ApiResponse.success(adminNotificationService.listNotifications(pageable)));
    }

    @PostMapping("/notifications/{notificationId}/retry")
    public ResponseEntity<ApiResponse<NotificationResponse>> retryNotification(@PathVariable UUID notificationId) {
        return ResponseEntity.ok(ApiResponse.success(adminNotificationService.retryEmailNotification(notificationId)));
    }

    @PostMapping("/concerts/{concertId}/reminders/send")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> sendReminder(@PathVariable UUID concertId) {
        int recipients = adminNotificationService.sendConcertReminder(concertId);
        return ResponseEntity.ok(ApiResponse.success(Map.of("recipients", recipients)));
    }
}
