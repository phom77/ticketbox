package org.ticketbox.ticketing.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.reminder.application.ReminderService;

@Component
public class ReminderSchedule {
    private final ReminderService reminders;

    public ReminderSchedule(ReminderService reminders) {
        this.reminders = reminders;
    }

    @Scheduled(fixedDelayString = "${ticketbox.notifications.reminder.fixed-delay-ms:300000}")
    public void scheduled() {
        reminders.scheduled();
    }
}
