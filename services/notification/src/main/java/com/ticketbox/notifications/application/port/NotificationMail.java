package com.ticketbox.notifications.application.port;

public interface NotificationMail {
    void send(NotificationRepository.Delivery delivery, String email, byte[] document)
            throws Exception;

    void sendPlain(String email, String subject, String body) throws Exception;
}
