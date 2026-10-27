package com.ticketbox.shared.payment;
import java.util.UUID;
public record PaymentAck(UUID eventId, String decision, String reason) {}
