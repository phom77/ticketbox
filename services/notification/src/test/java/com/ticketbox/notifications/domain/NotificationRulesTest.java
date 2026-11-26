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

    private static NotificationCommand refundRequest(String change, UUID event, UUID user, UUID request, String note) {
        return new NotificationCommand(1, event, "ticketing.refund-request-" + change, OffsetDateTime.now(), user, request,
                "correlation", request, "Concert", null, "", "", "DH-10000017", null, null, note);
    }

    @Test
    void refundRequestMessagesAreStablePerChangeAndRejectionNeedsANote() {
        UUID event = UUID.randomUUID(), user = UUID.randomUUID(), request = UUID.randomUUID();
        var received = refundRequest("received", event, user, request, null);
        assertTrue(received.refundRequest());
        assertEquals("received", received.refundRequestChange());
        var app = Notification.compose(received, Notification.Channel.APP, "S", "B");
        assertEquals("REFUND_REQUEST_RECEIVED", app.eventType());
        assertEquals(app.messageId(), Notification.compose(received, Notification.Channel.APP, "S", "B").messageId());
        var approved = refundRequest("approved", UUID.randomUUID(), user, request, null);
        assertNotEquals(app.messageId(), Notification.compose(approved, Notification.Channel.APP, "S", "B").messageId());
        assertEquals("REFUND_REQUEST_SUBMITTED", Notification.compose(
                refundRequest("submitted", UUID.randomUUID(), user, request, null), Notification.Channel.APP, "S", "B").eventType());
        assertThrows(IllegalArgumentException.class, () -> refundRequest("rejected", event, user, request, " "));
        assertEquals("Outside policy", refundRequest("rejected", event, user, request, "Outside policy").note());
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
