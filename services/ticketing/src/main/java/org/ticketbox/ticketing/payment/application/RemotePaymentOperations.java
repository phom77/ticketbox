package org.ticketbox.ticketing.payment.application;

import lombok.RequiredArgsConstructor;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Service;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.payment.PaymentInitiationResponse;
import org.ticketbox.ticketing.application.port.payment.PaymentWorkflowPort;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "ticketbox.payments.mode", havingValue = "remote")
public class RemotePaymentOperations {
    public enum Provider {
        VNPAY,
        MOMO,
        MOCK
    }

    public record PaymentStatusResponse(
            UUID orderId,
            String orderStatus,
            String provider,
            String providerRef,
            BigDecimal amount,
            UUID attemptId,
            String attemptState,
            String paymentUrl) {}

    public record WebhookHandleResult(String responseCode, String message) {}

    private final PaymentWorkflowPort workflow;
    private final PaymentGatewayClient remote;
    private final Environment environment;

    public PaymentInitiationResponse initiatePayment(UUID order, String name, UUID user) {
        Provider provider;
        try {
            provider =
                    Provider.valueOf(
                            name == null || name.isBlank()
                                    ? "MOCK"
                                    : name.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException error) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Cổng thanh toán không hợp lệ");
        }
        requireProvider(provider);
        // Checkout commits the intent locally. The dispatcher owns remote I/O.
        var intent = workflow.prepare(order, user, provider.name());
        var progress = workflow.owned(order, user);
        var snapshot = progress.snapshot();
        String paymentUrl = usablePaymentUrl(progress);
        return new PaymentInitiationResponse(
                order,
                provider.name(),
                provider == Provider.VNPAY ? order.toString() : intent.requestId(),
                paymentUrl,
                snapshot.attemptId(),
                snapshot.state());
    }

    public PaymentStatusResponse getPaymentStatus(UUID order, UUID user) {
        var progress = workflow.owned(order, user);
        var view = progress.order();
        var intent = progress.intent();
        var snapshot = progress.snapshot();
        return new PaymentStatusResponse(
                order,
                view.status(),
                intent == null ? view.paymentProvider() : intent.provider(),
                intent == null ? view.paymentRef() : intent.requestId(),
                view.totalAmount(),
                snapshot == null ? null : snapshot.attemptId(),
                snapshot == null ? null : snapshot.state(),
                usablePaymentUrl(progress));
    }

    public WebhookHandleResult handleWebhook(Provider provider, Map<String, String> payload) {
        var result = remote.webhook(provider.name(), payload);
        return new WebhookHandleResult(
                result.get("responseCode").toString(), result.get("message").toString());
    }

    public void processMockPaymentSuccess(UUID id) {
        requireProvider(Provider.MOCK);
        remote.mock(id, true);
    }

    public void processMockPaymentFail(UUID id) {
        requireProvider(Provider.MOCK);
        remote.mock(id, false);
    }

    private void requireProvider(Provider provider) {
        if (provider == Provider.MOCK && environment.acceptsProfiles(Profiles.of("prod"))) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST, "Thanh toán MOCK không được phép trong production");
        }
    }

    private static String usablePaymentUrl(PaymentWorkflowPort.Progress progress) {
        var snapshot = progress.snapshot();
        var order = progress.order();
        return snapshot != null
                        && "READY".equals(snapshot.state())
                        && "AWAITING_PAYMENT".equals(order.status())
                        && order.expiresAt().isAfter(OffsetDateTime.now())
                ? snapshot.paymentUrl()
                : null;
    }
}
