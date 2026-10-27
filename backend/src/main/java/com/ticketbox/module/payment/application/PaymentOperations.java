package com.ticketbox.module.payment.application;
import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.module.payment.web.dto.PaymentInitiationResponse;
import java.util.Map;
import java.util.UUID;
public interface PaymentOperations {
 PaymentInitiationResponse initiatePayment(UUID orderId,String provider,UUID userId);
 PaymentService.PaymentStatusResponse getPaymentStatus(UUID orderId,UUID userId);
 PaymentService.WebhookHandleResult handleWebhook(PaymentLog.Provider provider,Map<String,String> payload);
 void processMockPaymentSuccess(UUID orderId);
 void processMockPaymentFail(UUID orderId);
}
