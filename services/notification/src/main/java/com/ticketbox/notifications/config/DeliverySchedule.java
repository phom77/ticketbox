package com.ticketbox.notifications.config;

import com.ticketbox.notifications.application.DeliveryWorker;
import com.ticketbox.notifications.application.PasswordResetDelivery;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DeliverySchedule {
    private final DeliveryWorker delivery;
    private final PasswordResetDelivery resets;

    public DeliverySchedule(DeliveryWorker delivery, PasswordResetDelivery resets) {
        this.delivery = delivery;
        this.resets = resets;
    }

    @Scheduled(fixedDelayString = "${notification.delivery-interval-ms:1000}")
    public void deliver() {
        delivery.deliver();
    }

    @Scheduled(fixedDelayString = "${notification.password-reset-interval-ms:5000}")
    public void resetMail() {
        resets.deliver();
    }
}
