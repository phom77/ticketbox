package com.ticketbox.module.payment.application;

import com.ticketbox.module.payment.application.gateway.*;
import com.ticketbox.module.payment.domain.*;
import com.ticketbox.module.payment.web.dto.PaymentInitiationResponse;
import com.ticketbox.module.ticket.OrderPort;
import com.ticketbox.module.ticket.OrderView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.UUID;

/** Orchestration deliberately has no transaction spanning gateway I/O. */
@Service @RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="embedded",matchIfMissing=true)
public class PaymentService implements PaymentOperations {
    private final PaymentAttemptTransactions transactions;
    private final PaymentAttemptRepository attempts;
    private final OrderPort orderPort;
    private final PaymentGatewayResolver gatewayResolver;
    private final PaymentGatewayExecutor executor;

    public PaymentInitiationResponse initiatePayment(UUID orderId, String providerName, UUID userId) {
        PaymentLog.Provider provider = parseProvider(providerName);
        // Reject unavailable providers before creating a durable attempt or locking its provider.
        PaymentGateway gateway = gatewayResolver.resolve(provider);
        return executor.create(() -> initiateWithinCapacity(orderId, userId, provider, gateway));
    }
    private PaymentInitiationResponse initiateWithinCapacity(UUID orderId, UUID userId, PaymentLog.Provider provider,
                                                            PaymentGateway gateway) {
        var prepared = transactions.prepare(orderId, userId, provider);
        if (!prepared.callGateway()) return prepared.response();
        PaymentInitiationResult result;
        try {
            result = gateway.initiatePayment(prepared.order(), prepared.requestId());
        } catch (GatewayNotSubmittedException exception) {
            transactions.notSubmitted(orderId, prepared.requestId(), exception.getMessage());
            throw exception;
        } catch (RuntimeException exception) {
            return transactions.finish(orderId, prepared.requestId(), null, exception.getMessage());
        }
        // Do not misclassify a DB finalization failure as a gateway failure. A stale PROCESSING
        // record will be claimed by the reconciler after its create deadline.
        return transactions.finish(orderId, prepared.requestId(), result, null);
    }

    public PaymentStatusResponse getPaymentStatus(UUID orderId, UUID userId) {
        OrderView order = orderPort.findOrderById(orderId)
                .filter(found -> found.userId().equals(userId))
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));
        PaymentAttempt attempt = attempts.findByOrderId(orderId).orElse(null);
        return new PaymentStatusResponse(order.id(), order.status(), attempt == null ? order.paymentProvider() : attempt.getProvider().name(),
                attempt == null ? order.paymentRef() : attempt.getRequestId(),
                order.totalAmount(), attempt == null ? null : attempt.getId(),
                attempt == null ? null : attempt.getState().name(),
                attempt != null && attempt.getState() == PaymentAttempt.State.READY &&
                    "AWAITING_PAYMENT".equals(order.status()) && order.expiresAt().isAfter(java.time.OffsetDateTime.now())
                    ? attempt.getPaymentUrl() : null);
    }

    public WebhookHandleResult handleWebhook(PaymentLog.Provider provider, Map<String, String> payload) {
        PaymentWebhookResult result = gatewayResolver.resolve(provider).verifyWebhook(payload);
        if (!result.valid()) return new WebhookHandleResult("97", result.failureReason());
        return transactions.receive(provider, result, payload.get("requestId"));
    }

    public void processMockPaymentSuccess(UUID orderId) { mockReceipt(orderId, true); }
    public void processMockPaymentFail(UUID orderId) { mockReceipt(orderId, false); }
    private void mockReceipt(UUID orderId, boolean success) {
        gatewayResolver.resolve(PaymentLog.Provider.MOCK);
        OrderView order = orderPort.findOrderById(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));
        var receipt = new PaymentWebhookResult(true, success, orderId, "MOCK-TXN-" + orderId,
                order.totalAmount(), "{\"provider\":\"MOCK\",\"success\":" + success + "}", null);
        WebhookHandleResult handled = transactions.receive(PaymentLog.Provider.MOCK, receipt, null);
        if (!"00".equals(handled.responseCode()) && !"02".equals(handled.responseCode())) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, handled.message());
        }
    }
    private PaymentLog.Provider parseProvider(String providerName) {
        if (providerName == null || providerName.isBlank()) return PaymentLog.Provider.MOCK;
        try { return PaymentLog.Provider.valueOf(providerName.trim().toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException ex) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Nhà cung cấp thanh toán không được hỗ trợ: " + providerName);
        }
    }
    public record WebhookHandleResult(String responseCode, String message) {}
    public record PaymentStatusResponse(UUID orderId, String orderStatus, String provider, String providerRef,
            java.math.BigDecimal amount, UUID attemptId, String attemptState, String paymentUrl) {}
}
