package com.ticketbox.module.notification.web;

import com.ticketbox.module.notification.application.ConcertReminderScheduler;
import com.ticketbox.shared.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;

@RestController @RequiredArgsConstructor
@ConditionalOnProperty(name="ticketbox.notifications.mode",havingValue="remote")
public class RemoteReminderController {
    private final ConcertReminderScheduler reminders;
    @PostMapping("/api/admin/concerts/{id}/reminders/send")
    public Object send(@PathVariable UUID id) {
        return ApiResponse.success(Map.of("recipients",reminders.sendReminderForConcert(id)));
    }
}
