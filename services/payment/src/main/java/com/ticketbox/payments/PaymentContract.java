package com.ticketbox.payments;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public final class PaymentContract {
 private PaymentContract(){}
 public record Intent(int schemaVersion,UUID intentId,UUID orderId,UUID userId,String provider,BigDecimal amount,
  String currency,OffsetDateTime expiresAt,long orderVersion,String requestId,String correlationId){}
 public record Result(int schemaVersion,UUID eventId,UUID intentId,UUID orderId,UUID userId,String provider,String requestId,
  BigDecimal amount,String currency,long orderVersion,String transactionId,OffsetDateTime occurredAt){}
 public record Ack(UUID eventId,String decision,String reason){}
 public record Snapshot(UUID attemptId,String state,String paymentUrl,String providerRef){}
 public record WebhookAck(String responseCode,String message){}
}
