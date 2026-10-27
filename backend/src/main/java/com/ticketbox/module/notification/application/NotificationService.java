package com.ticketbox.module.notification.application;

import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.module.notification.domain.NotificationRepository;
import com.ticketbox.module.notification.web.dto.NotificationResponse;
import com.ticketbox.module.ticket.OrderNotificationItemView;
import com.ticketbox.module.ticket.OrderNotificationView;
import com.ticketbox.module.ticket.OrderPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.notifications.mode", havingValue="embedded", matchIfMissing=true)
public class NotificationService {

    private static final Locale VIETNAM = Locale.forLanguageTag("vi-VN");
    private static final NumberFormat VND = NumberFormat.getCurrencyInstance(VIETNAM);
    private static final DateTimeFormatter DATE_TIME =
            DateTimeFormatter.ofPattern("HH:mm 'ngay' dd/MM/yyyy", VIETNAM);

    private final NotificationRepository notificationRepository;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final OrderPort orderPort;

    public Page<NotificationResponse> getNotifications(UUID userId, Pageable pageable) {
        return notificationRepository.findByUserId(userId, pageable)
                .map(NotificationResponse::from);
    }

    public long countUnreadAppNotifications(UUID userId) {
        return notificationRepository.countByUserIdAndChannelAndReadAtIsNull(userId, Notification.Channel.APP);
    }

    @Transactional
    public NotificationResponse markAsRead(UUID userId, UUID notificationId) {
        Notification notification = notificationRepository.findByIdAndUserId(notificationId, userId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy thông báo"));

        notification.markAsRead(OffsetDateTime.now());
        notificationRepository.save(notification);

        return NotificationResponse.from(notification);
    }

    @Transactional
    public Optional<Notification> createPaymentSucceededNotification(CreatePaymentNotificationCommand command) {
        // A DB-scoped message lock serializes inbox creation across consumers; hash collision only serializes unrelated events.
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement=connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?,0))")) {
                statement.setString(1,command.messageId().toString()); statement.execute(); return null;
            }
        });
        UUID appMessageId = UUID.nameUUIDFromBytes(
                ("PAYMENT_SUCCEEDED:APP:" + command.messageId()).getBytes()
        );
        UUID emailMessageId = UUID.nameUUIDFromBytes(
                ("PAYMENT_SUCCEEDED:EMAIL:" + command.messageId()).getBytes()
        );

        OrderNotificationView order = orderPort.findNotificationViewByOrderId(command.orderId()).orElse(null);
        String appSubject = order == null
                ? "Thanh toan thanh cong"
                : "Ve " + order.concertTitle() + " da san sang";
        String emailSubject = order == null
                ? "Thanh toan thanh cong - TicketBox"
                : "Xac nhan ve " + order.concertTitle() + " - TicketBox";
        String appBody = order == null
                ? "Don hang " + shortId(command.orderId()) + " da thanh toan thanh cong. Tong tien: "
                        + money(command.amount()) + ". Ve cua ban da duoc phat hanh trong My Tickets."
                : buildPaymentAppBody(order);
        String emailBody = order == null
                ? "TicketBox da xac nhan thanh toan cho don hang " + command.orderId()
                        + ". Tong tien: " + money(command.amount())
                        + ". Vui long mo My Tickets de xem e-ticket va QR check-in."
                : buildPaymentEmailBody(order);

        if (!notificationRepository.existsByMessageId(appMessageId)) {
            Notification appNotification = Notification.createAppNotification(
                    appMessageId,
                    command.userId(),
                    "PAYMENT_SUCCEEDED",
                    appSubject,
                    appBody,
                    OffsetDateTime.now()
            );
            notificationRepository.save(appNotification);
        }

        if (notificationRepository.existsByMessageId(emailMessageId)) {
            return Optional.empty();
        }

        Notification emailNotification = Notification.createEmailNotification(
                emailMessageId,
                command.userId(),
                "PAYMENT_SUCCEEDED",
                emailSubject,
                emailBody,
                command.orderId()
        );
        notificationRepository.save(emailNotification);
        return Optional.of(emailNotification);
    }

    @Transactional
    public void markEmailSent(UUID notificationId) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            n.setStatus(Notification.Status.SENT);
            n.setSentAt(OffsetDateTime.now());
            notificationRepository.save(n);
        });
    }

    @Transactional
    public void markEmailSkipped(UUID notificationId, String reason) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            n.setStatus(Notification.Status.SKIPPED);
            n.setLastError(reason);
            notificationRepository.save(n);
        });
    }

    @Transactional
    public void recordEmailAttemptFailed(UUID notificationId, String error) {
        notificationRepository.findById(notificationId).ifPresent(n -> {
            int newAttempts = n.getAttempts() + 1;
            n.setAttempts(newAttempts);
            n.setLastError(error);
            if (newAttempts >= 3) {
                n.setStatus(Notification.Status.FAILED);
            }
            notificationRepository.save(n);
        });
    }

    public Optional<Notification> findNotificationById(UUID notificationId) {
        return notificationRepository.findById(notificationId);
    }

    private String buildPaymentAppBody(OrderNotificationView order) {
        return "TicketBox da xac nhan " + order.totalTickets() + " ve cho "
                + order.concertTitle()
                + ". Dem dien: " + formatDate(order.eventDate())
                + ". Tong thanh toan: " + money(order.totalAmount())
                + ". Mo My Tickets de xem QR check-in.";
    }

    private String buildPaymentEmailBody(OrderNotificationView order) {
        StringBuilder body = new StringBuilder();
        body.append("Xin chao,\n\n")
                .append("TicketBox da xac nhan thanh toan cua ban cho ")
                .append(order.concertTitle())
                .append(". E-ticket va ma QR check-in da san sang trong muc My Tickets.\n\n")
                .append("Thong tin don hang\n")
                .append("- Ma don: ").append(order.orderId()).append('\n')
                .append("- Dem dien: ").append(formatDate(order.eventDate())).append('\n');

        if (order.venueName() != null && !order.venueName().isBlank()) {
            body.append("- Dia diem: ").append(order.venueName()).append('\n');
        }

        body.append("- So luong ve: ").append(order.totalTickets()).append('\n')
                .append("- Tong thanh toan: ").append(money(order.totalAmount())).append("\n\n")
                .append("Hang ve da mua\n");

        for (OrderNotificationItemView item : order.items()) {
            body.append("- ")
                    .append(item.ticketTypeName())
                    .append(" x")
                    .append(item.quantity())
                    .append(" - ")
                    .append(money(item.subtotal()))
                    .append('\n');
        }

        body.append("\nKhi den cong, hay mo My Tickets va xuat trinh QR cua tung ve. ")
                .append("Khong chia se QR cho nguoi khac de tranh mat quyen vao cong.\n\n")
                .append("Hen gap ban tai dem dien,\n")
                .append("TicketBox");
        return body.toString();
    }

    private String formatDate(OffsetDateTime dateTime) {
        return dateTime == null ? "dang cap nhat" : DATE_TIME.format(dateTime);
    }

    private String money(BigDecimal amount) {
        return NumberFormat.getCurrencyInstance(VIETNAM).format(amount == null ? BigDecimal.ZERO : amount);
    }

    private String shortId(UUID id) {
        return id.toString().substring(0, 8).toUpperCase(Locale.ROOT);
    }
}
