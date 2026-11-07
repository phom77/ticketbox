package com.ticketbox.notifications.infrastructure.mail;

import com.ticketbox.notifications.application.port.NotificationMail;
import com.ticketbox.notifications.application.port.NotificationRepository;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class SmtpNotificationMail implements NotificationMail {
    private final JavaMailSender smtp;

    public SmtpNotificationMail(JavaMailSender smtp) {
        this.smtp = smtp;
    }

    public void send(NotificationRepository.Delivery delivery, String email, byte[] document)
            throws Exception {
        var message = smtp.createMimeMessage();
        var mail = new MimeMessageHelper(message, document != null, "UTF-8");
        mail.setFrom("noreply@ticketbox.vn");
        mail.setTo(email);
        mail.setSubject(delivery.subject());
        mail.setText(delivery.body(), false);
        if (document != null)
            mail.addAttachment(
                    "ticket-" + delivery.order() + ".pdf",
                    new ByteArrayResource(document),
                    "application/pdf");
        smtp.send(message);
    }
}
