package org.ticketbox.ticketing.web.internal;

import org.springframework.web.bind.annotation.*;
import org.ticketbox.ticketing.reminder.application.ReminderService;
import org.ticketbox.ticketing.web.ApiResponse;

import java.util.UUID;

@RestController
public class ReminderController {
    private final ReminderService reminders;

    public ReminderController(ReminderService reminders) {
        this.reminders = reminders;
    }

    @PostMapping("/api/admin/concerts/{id}/reminders/send")
    public Object dispatch(@PathVariable UUID id) {
        return ApiResponse.success(reminders.dispatch(id));
    }
}
