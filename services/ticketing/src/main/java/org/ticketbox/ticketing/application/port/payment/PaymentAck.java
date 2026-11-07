package org.ticketbox.ticketing.application.port.payment;

import java.util.UUID;

public record PaymentAck(UUID eventId, String decision, String reason) {}
