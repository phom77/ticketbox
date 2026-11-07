package com.ticketbox.notifications.config;

import com.ticketbox.notifications.application.DeliveryWorker;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DeliverySchedule {
    private final DeliveryWorker delivery;

    public DeliverySchedule(DeliveryWorker delivery) {
        this.delivery = delivery;
    }

    @Scheduled(fixedDelayString = "${notification.delivery-interval-ms:1000}")
    public void deliver() {
        delivery.deliver();
    }
}
