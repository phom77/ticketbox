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
                        "",
                        null);
        var email = Notification.compose(command, Notification.Channel.EMAIL, "Subject", "Body");
        assertEquals(
                email.messageId(),
                Notification.compose(command, Notification.Channel.EMAIL, "Subject", "Body")
                        .messageId());
        assertNotEquals(
                email.messageId(),
                Notification.compose(command, Notification.Channel.APP, "Subject", "Body")
                        .messageId());
        assertThrows(
                IllegalArgumentException.class,
                () -> transfer("ticketing.ticket-transfer-offered", event, user, order, " ", "SENDER"));
        assertThrows(
                IllegalArgumentException.class,
                () -> transfer("ticketing.ticket-transfer-offered", event, user, order, "Fran", "OTHER"));
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
                                "",
                                null));
    }

    private static NotificationCommand transfer(
            String type, UUID event, UUID user, UUID transfer, String other, String role) {
        return new NotificationCommand(1, event, type, OffsetDateTime.now(), user, transfer, "correlation", transfer,
                "Concert", null, "", "", null, other, role);
    }

    @Test
    void transferMessagesAreStablePerPersonAndChange() {
        UUID event = UUID.randomUUID(), user = UUID.randomUUID(), transfer = UUID.randomUUID();
        var offered = transfer("ticketing.ticket-transfer-offered", event, user, transfer, "Fran", "RECIPIENT");
        assertTrue(offered.ticketTransfer());
        assertEquals("offered", offered.transferChange());
        var app = Notification.compose(offered, Notification.Channel.APP, "S", "B");
        assertEquals("TICKET_TRANSFER_OFFERED", app.eventType());
        assertEquals(app.messageId(), Notification.compose(offered, Notification.Channel.APP, "S", "B").messageId());
        var accepted = transfer("ticketing.ticket-transfer-accepted", UUID.randomUUID(), user, transfer, "Fran", "RECIPIENT");
        assertNotEquals(app.messageId(), Notification.compose(accepted, Notification.Channel.APP, "S", "B").messageId());
    }
}
