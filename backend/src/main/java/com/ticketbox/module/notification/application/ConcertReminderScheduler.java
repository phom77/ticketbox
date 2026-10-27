package com.ticketbox.module.notification.application;

import com.ticketbox.module.concert.ConcertReminderPort;
import com.ticketbox.module.concert.ConcertReminderView;
import com.ticketbox.module.notification.domain.Notification;
import com.ticketbox.module.notification.domain.NotificationRepository;
import com.ticketbox.module.notification.infrastructure.EmailNotificationPublisher;
import com.ticketbox.module.ticket.TicketReminderRecipientPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class ConcertReminderScheduler {

    private static final DateTimeFormatter DATE_TIME =
            DateTimeFormatter.ofPattern("HH:mm 'ngay' dd/MM/yyyy", Locale.forLanguageTag("vi-VN"));

    private final com.ticketbox.infrastructure.integration.RemoteReminderDispatcher remote;
    @org.springframework.beans.factory.annotation.Value("${ticketbox.notifications.mode:embedded}")
    private String notificationMode;
    private final ConcertReminderPort concertReminderPort;
    private final TicketReminderRecipientPort ticketReminderRecipientPort;
    private final NotificationRepository notificationRepository;
    private final EmailNotificationPublisher emailNotificationPublisher;

    @Scheduled(fixedDelayString = "${ticketbox.notifications.reminder.fixed-delay-ms:300000}")
    @net.javacrumbs.shedlock.spring.annotation.SchedulerLock(name="concertReminders",lockAtMostFor="PT5M",lockAtLeastFor="PT5S")
    public void sendReminders() {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime from = now.plusHours(23);
        OffsetDateTime to = now.plusHours(25);

        List<ConcertReminderView> concerts = concertReminderPort.findConcertsStartingBetween(from, to);
        if (concerts.isEmpty()) {
            return;
        }

        log.info("ConcertReminderScheduler: found {} concerts in window [{}, {}]", concerts.size(), from, to);

        for (ConcertReminderView concert : concerts) {
            for (UUID userId : ticketReminderRecipientPort.findDistinctUserIdsByConcertId(concert.id())) {
                try {
                    processReminder(concert, userId);
                } catch (Exception ex) {
                    log.error("ConcertReminderScheduler: failed for concertId={} userId={} - {}",
                            concert.id(), userId, ex.getMessage(), ex);
                }
            }
        }
    }

    public int sendReminderForConcert(UUID concertId) {
        ConcertReminderView concert = concertReminderPort.findReminderConcertById(concertId)
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert hoặc concert chưa đủ điều kiện gửi nhắc lịch"));
        List<UUID> userIds = ticketReminderRecipientPort.findDistinctUserIdsByConcertId(concert.id());
        for (UUID userId : userIds) {
            processReminder(concert, userId);
        }
        return userIds.size();
    }

    @Transactional
    protected void processReminder(ConcertReminderView concert, UUID userId) {
        if ("remote".equals(notificationMode)) { remote.dispatch(concert, userId); return; }
        UUID appMessageId = UUID.nameUUIDFromBytes(
                ("CONCERT_REMINDER:APP:" + concert.id() + ":" + userId).getBytes()
        );
        UUID emailMessageId = UUID.nameUUIDFromBytes(
                ("CONCERT_REMINDER:EMAIL:" + concert.id() + ":" + userId).getBytes()
        );

        String subject = "Nhac lich: " + concert.title() + " dien ra trong 24 gio toi";
        String body = buildReminderBody(concert);

        if (!notificationRepository.existsByMessageId(appMessageId)) {
            Notification appNotification = Notification.createAppNotification(
                    appMessageId,
                    userId,
                    "CONCERT_REMINDER",
                    subject,
                    body,
                    OffsetDateTime.now()
            );
            notificationRepository.save(appNotification);
        }

        if (!notificationRepository.existsByMessageId(emailMessageId)) {
            Notification emailNotification = Notification.createEmailNotification(
                    emailMessageId,
                    userId,
                    "CONCERT_REMINDER",
                    subject,
                    body
            );
            notificationRepository.save(emailNotification);
            emailNotificationPublisher.publishEmailNotification(emailNotification.getId());
        }
    }

    private String buildReminderBody(ConcertReminderView concert) {
        return "Xin chao,\n\n"
                + "TicketBox nhac ban ve dem dien \"" + concert.title() + "\" sap dien ra trong 24 gio toi.\n\n"
                + "Thong tin su kien\n"
                + "- Thoi gian: " + DATE_TIME.format(concert.eventDate()) + "\n"
                + "- Dia diem: " + concert.venueName() + "\n"
                + "- Dia chi: " + concert.venueAddress() + "\n\n"
                + "Vui long mo My Tickets truoc khi den cong va chuan bi QR e-ticket. "
                + "QR chi nen duoc xuat trinh cho nhan su soat ve cua TicketBox.\n\n"
                + "Hen gap ban tai dem dien,\n"
                + "TicketBox";
    }
}
