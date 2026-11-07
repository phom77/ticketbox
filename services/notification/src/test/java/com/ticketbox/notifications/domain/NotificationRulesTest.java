package com.ticketbox.notifications.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

class NotificationRulesTest {
    @Test
    void messageIdentityIsStablePerChannelAndInvalidMoneyIsRejected() {
        UUID event = UUID.randomUUID(), user = UUID.randomUUID(), order = UUID.randomUUID();
        var command =
                new NotificationCommand(
                        1,
                        event,
                        "ticketing.order-confirmed",
                        OffsetDateTime.now(),
                        user,
                        order,
                        "correlation",
                        order,
                        "Đêm nhạc",
                        BigDecimal.TEN,
                        "",
                        "");
        var email = Notification.compose(command, Notification.Channel.EMAIL);
        assertEquals(
                email.messageId(),
                Notification.compose(command, Notification.Channel.EMAIL).messageId());
        assertNotEquals(
                email.messageId(),
                Notification.compose(command, Notification.Channel.APP).messageId());
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        new NotificationCommand(
                                1,
                                event,
                                "ticketing.order-confirmed",
                                OffsetDateTime.now(),
                                user,
                                order,
                                "correlation",
                                order,
                                "Concert",
                                BigDecimal.TEN.negate(),
                                "",
                                ""));
    }
}
