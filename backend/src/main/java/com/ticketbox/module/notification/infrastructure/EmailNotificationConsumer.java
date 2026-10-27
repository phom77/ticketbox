package com.ticketbox.module.notification.infrastructure;

import com.ticketbox.infrastructure.rabbitmq.EmailNotificationMessage;
import com.ticketbox.infrastructure.rabbitmq.RabbitMqNames;
import com.ticketbox.module.auth.UserContactPort;
import com.ticketbox.module.auth.UserContactView;
import com.ticketbox.module.notification.application.NotificationService;
import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.module.ticket.ETicketDocumentPort;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Component;

/**
 * Consumes {@link EmailNotificationMessage} from {@code notification.email} queue and
 * delivers the email via {@link JavaMailSender}.
 *
 * <p><b>Idempotency</b>: Before sending, the consumer verifies that the notification
 * exists, has channel=EMAIL, and status=PENDING. If status is already SENT (e.g. due
 * to RabbitMQ redelivery after a broker restart), the message is silently acknowledged
 * without resending.
 *
 * <p><b>Retry / DLQ</b>: On failure the exception propagates, Spring AMQP retries up to
 * 3 times (configured in application.yml), then routes the message to
 * {@code notification.email.dlq} via the dead-letter exchange.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class EmailNotificationConsumer {

    private static final String FROM_ADDRESS = "noreply@ticketbox.vn";

    private final NotificationService notificationService;
    private final com.ticketbox.module.notification.application.EmailDeliveryClaims deliveryClaims;
    private final UserContactPort userContactPort;
    private final JavaMailSender mailSender;
    private final ETicketDocumentPort eTicketDocumentPort;

    @RabbitListener(queues = RabbitMqNames.NOTIFICATION_EMAIL_QUEUE)
    public void consume(EmailNotificationMessage message) {
        java.util.UUID notificationId = message.notificationId();

        // --- Idempotency check ---
        Notification notification = notificationService.findNotificationById(notificationId)
                .orElse(null);

        if (notification == null || notification.getChannel() != Notification.Channel.EMAIL) {
            log.warn("EmailNotificationConsumer: notification {} not found or wrong channel – skipping", notificationId);
            return;
        }

        if (notification.getStatus() == Notification.Status.SENT) {
            log.info("EmailNotificationConsumer: notification {} already SENT – skipping redelivery", notificationId);
            return;
        }

        if (notification.getStatus() != Notification.Status.PENDING) {
            log.warn("EmailNotificationConsumer: notification {} in unexpected status {} – skipping",
                    notificationId, notification.getStatus());
            return;
        }

        java.util.UUID owner = java.util.UUID.randomUUID();
        if (!deliveryClaims.claim(notificationId, owner)) return;
        // Resolve and send without holding a DB transaction. SMTP is at-least-once if a process
        // dies after the remote server accepts mail but before recording SENT.
        try {
        // --- Resolve recipient ---
        UserContactView contact = userContactPort.findById(notification.getUserId())
                .orElse(null);

        if (contact == null || contact.email() == null || contact.email().isBlank()) {
            // The user has no resolvable email address – retrying would never help,
            // so we mark the notification SKIPPED (audit trail preserved) and ACK the message.
            log.warn("EmailNotificationConsumer: no active user contact for userId={} – marking SKIPPED",
                    notification.getUserId());
            deliveryClaims.complete(notificationId, owner, "SKIPPED",
                    "User contact not found or email blank for userId=" + notification.getUserId());
            return;
        }

        // --- Send email ---
            var mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper mail = new MimeMessageHelper(mimeMessage, true, "UTF-8");
            mail.setFrom(FROM_ADDRESS);
            mail.setTo(contact.email());
            mail.setSubject(notification.getSubject());
            mail.setText(notification.getBody(), false);
            if ("PAYMENT_SUCCEEDED".equals(notification.getEventType()) && notification.getReferenceId() != null) {
                var document = eTicketDocumentPort.createForOrder(notification.getReferenceId())
                        .orElseThrow(() -> new IllegalStateException(
                                "E-ticket is not ready for order " + notification.getReferenceId()));
                mail.addAttachment(document.filename(), new ByteArrayResource(document.content()), document.contentType());
            }
            mailSender.send(mimeMessage);

            deliveryClaims.complete(notificationId, owner, "SENT", null);
            log.info("EmailNotificationConsumer: email sent for notification {}", notificationId);

        } catch (Exception ex) {
            String error = ex.getClass().getSimpleName() + ": " + ex.getMessage();
            log.error("EmailNotificationConsumer: failed to send email for notification {} – {}", notificationId, error);
            deliveryClaims.fail(notificationId, owner, error);
            // Re-throw so Spring AMQP retry kicks in; after max-attempts the message goes to DLQ
            if (ex instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException("Email delivery failed", ex);
        }
    }
}
