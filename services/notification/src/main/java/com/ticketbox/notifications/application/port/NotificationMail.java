package com.ticketbox.notifications.application.port;

public interface NotificationMail {
    void send(NotificationRepository.Delivery delivery, String email, byte[] document)
            throws Exception;
}
