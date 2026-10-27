package com.ticketbox.module.payment.application;

import com.ticketbox.module.payment.application.gateway.*;
import com.ticketbox.module.payment.domain.*;
import com.ticketbox.module.payment.web.dto.PaymentInitiationResponse;
import com.ticketbox.module.ticket.OrderPort;
import com.ticketbox.module.ticket.OrderView;
import com.ticketbox.shared.event.PaymentCompletedEvent;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Short transactions only. Every order/attempt mutation locks order first, matching cancel/expiry. */
@Service @RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="embedded",matchIfMissing=true)
public class PaymentAttemptTransactions {
    private final PaymentAttemptRepository attempts;
    private final PaymentLogRepository logs;
    private final OrderPort orders;
    private final ApplicationEventPublisher events;

    @Transactional(noRollbackFor = AppException.class)
    public Prepared prepare(UUID orderId, UUID userId, PaymentLog.Provider provider) {
        OrderView order = orders.getPayableOrderForUser(orderId, userId);
        PaymentAttempt attempt = attempts.findByOrderId(orderId).orElse(null);
        if (attempt != null) {
            if (attempt.getProvider() != provider) throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Đơn hàng đã có phiên thanh toán. Vui lòng tiếp tục với cổng đã chọn");
            boolean retryUnsent = attempt.getState() == PaymentAttempt.State.CREATED;
            if (retryUnsent) {
                attempt.setState(PaymentAttempt.State.PROCESSING);
                attempt.setNextQueryAt(OffsetDateTime.now().plusMinutes(2));
            }
            return new Prepared(order, attempt.getRequestId(), retryUnsent, response(attempt, order));
        }
        // Legacy sessions remain payable and cannot be switched either.
        if (order.paymentUrl() != null && !provider.name().equals(order.paymentProvider())) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "Đơn hàng đã có phiên thanh toán");
        }
        attempt = new PaymentAttempt();
        attempt.setOrderId(orderId); attempt.setProvider(provider);
        attempt.setRequestId(UUID.randomUUID().toString()); attempt.setAmount(order.totalAmount());
        attempt.setExpiresAt(order.expiresAt()); attempt.setState(PaymentAttempt.State.PROCESSING);
        attempt.setNextQueryAt(OffsetDateTime.now().plusMinutes(2));
        if (order.paymentUrl() != null) {
            attempt.setState(PaymentAttempt.State.READY); attempt.setPaymentUrl(order.paymentUrl());
            attempt.setRequestId(provider == PaymentLog.Provider.MOMO ? order.paymentRef() : orderId.toString());
        }
        attempts.saveAndFlush(attempt);
        return new Prepared(order, attempt.getRequestId(), attempt.getState() == PaymentAttempt.State.PROCESSING,
                response(attempt, order));
    }

    @Transactional
    public PaymentInitiationResponse finish(UUID orderId, String requestId, PaymentInitiationResult result, String error) {
        OrderView order = orders.lockOrder(orderId).orElseThrow();
        PaymentAttempt attempt = attempts.findByOrderId(orderId).orElseThrow();
        if (!attempt.getRequestId().equals(requestId)) throw new IllegalStateException("Attempt identity changed");
        // A callback may have committed success while the create request was still in flight.
        if (attempt.getState() == PaymentAttempt.State.PROCESSING || attempt.getState() == PaymentAttempt.State.UNKNOWN) {
            if (result != null) {
                attempt.setState(PaymentAttempt.State.READY); attempt.setPaymentUrl(result.paymentUrl());
                attempt.setRawPayload(result.rawPayload());
                if ("AWAITING_PAYMENT".equals(order.status()) && order.expiresAt().isAfter(OffsetDateTime.now())) {
                    orders.markPaymentInitiated(orderId, attempt.getProvider().name(), requestId, result.paymentUrl());
                }
                audit(attempt, PaymentLog.EventType.INITIATED, result.providerRef(), result.rawPayload());
            } else {
                attempt.setState(PaymentAttempt.State.UNKNOWN);
                attempt.setLastError(error == null ? "Gateway result unavailable" : error.substring(0, Math.min(1000, error.length())));
            }
            attempt.setNextQueryAt(OffsetDateTime.now().plusSeconds(30));
        }
        return response(attempt, order);
    }

    @Transactional
    public void notSubmitted(UUID orderId, String requestId, String error) {
        orders.lockOrder(orderId).orElseThrow();
        PaymentAttempt attempt=attempts.findByOrderId(orderId).orElseThrow();
        if (attempt.getRequestId().equals(requestId) && attempt.getState() == PaymentAttempt.State.PROCESSING) {
            attempt.setState(PaymentAttempt.State.CREATED);
            attempt.setLastError(error == null ? "Not submitted" : error.substring(0,Math.min(1000,error.length())));
        }
    }

    @Transactional
    public PaymentService.WebhookHandleResult receive(PaymentLog.Provider provider, PaymentWebhookResult receipt,
                                                       String requestId) {
        OrderView order = orders.lockOrder(receipt.orderId()).orElse(null);
        if (order == null) return new PaymentService.WebhookHandleResult("01", "Không tìm thấy đơn hàng");
        PaymentAttempt attempt = attempts.findByOrderId(order.id()).orElse(null);
        if (attempt == null && "PAID".equals(order.status()) && provider.name().equals(order.paymentProvider()) &&
                java.util.Objects.equals(receipt.providerRef(), order.paymentRef()) && receipt.amount() != null &&
                receipt.amount().compareTo(order.totalAmount()) == 0) {
            return new PaymentService.WebhookHandleResult("02", "Đơn hàng đã được xác nhận");
        }
        if (attempt == null || attempt.getProvider() != provider ||
                (provider == PaymentLog.Provider.MOMO && !attempt.getRequestId().equals(requestId))) {
            return new PaymentService.WebhookHandleResult("01", "Không tìm thấy phiên thanh toán tương ứng");
        }
        if (receipt.amount() == null || receipt.amount().compareTo(attempt.getAmount()) != 0) {
            return new PaymentService.WebhookHandleResult("04", "Số tiền không hợp lệ");
        }
        if (receipt.success() && (receipt.providerRef() == null || receipt.providerRef().isBlank())) {
            return new PaymentService.WebhookHandleResult("97", "Thiếu mã giao dịch thanh toán");
        }
        if (isSettled(attempt)) return new PaymentService.WebhookHandleResult("02", "Đơn hàng đã được xác nhận");
        if (receipt.pending()) {
            attempt.setState(PaymentAttempt.State.UNKNOWN); attempt.setRawPayload(receipt.rawPayload());
            attempt.setNextQueryAt(OffsetDateTime.now().plusSeconds(30));
            audit(attempt, PaymentLog.EventType.WEBHOOK_RECEIVED, receipt.providerRef(), receipt.rawPayload());
            return new PaymentService.WebhookHandleResult("00", "Kết quả đang được kiểm tra");
        }
        if (!receipt.success()) {
            // Failure is not proof that a subsequently arriving success can be discarded.
            attempt.setState(PaymentAttempt.State.FAILED); attempt.setRawPayload(receipt.rawPayload());
            audit(attempt, PaymentLog.EventType.FAILED, receipt.providerRef(), receipt.rawPayload());
            return new PaymentService.WebhookHandleResult("00", "Đã ghi nhận kết quả thanh toán thất bại");
        }
        settle(attempt, order, receipt.providerRef(), receipt.rawPayload());
        return new PaymentService.WebhookHandleResult("00", "Xác nhận thành công");
    }

    private void settle(PaymentAttempt attempt, OrderView order, String transactionId, String payload) {
        boolean issued = orders.settlePayment(order.id(), attempt.getProvider().name(), transactionId);
        attempt.setState(issued ? PaymentAttempt.State.SUCCEEDED : PaymentAttempt.State.RECONCILIATION_REQUIRED);
        attempt.setProviderTransactionId(transactionId); attempt.setRawPayload(payload);
        attempt.setLeaseOwner(null); attempt.setLeaseUntil(null);
        audit(attempt, PaymentLog.EventType.SUCCESS, transactionId, payload);
        if (issued) events.publishEvent(new PaymentCompletedEvent(UUID.randomUUID(), order.id(), order.userId(),
                attempt.getProvider().name(), transactionId, attempt.getAmount(), OffsetDateTime.now()));
    }

    private boolean isSettled(PaymentAttempt attempt) {
        return attempt.getState() == PaymentAttempt.State.SUCCEEDED ||
                attempt.getState() == PaymentAttempt.State.RECONCILIATION_REQUIRED;
    }

    private void audit(PaymentAttempt attempt, PaymentLog.EventType type, String ref, String payload) {
        if (logs.existsByOrderIdAndEventType(attempt.getOrderId(), type)) return;
        PaymentLog log = new PaymentLog(); log.setOrderId(attempt.getOrderId()); log.setProvider(attempt.getProvider());
        log.setEventType(type); log.setAmount(attempt.getAmount()); log.setProviderRef(ref);
        log.setRawPayload(payload == null ? "{}" : payload); logs.save(log);
    }

    @Transactional
    public List<QueryClaim> claimQueries(int batch) {
        return attempts.claimable(batch).stream().map(attempt -> {
            UUID owner = UUID.randomUUID(); attempt.setLeaseOwner(owner);
            attempt.setLeaseUntil(OffsetDateTime.now().plusMinutes(2));
            return new QueryClaim(attempt.getOrderId(), attempt.getProvider(), attempt.getRequestId(),
                    attempt.getRawPayload(), owner);
        }).toList();
    }

    @Transactional
    public void finishQuery(QueryClaim claim, PaymentQueryResult result) {
        OrderView order = orders.lockOrder(claim.orderId()).orElseThrow();
        PaymentAttempt attempt = attempts.findByOrderId(claim.orderId()).orElseThrow();
        if (!claim.owner().equals(attempt.getLeaseOwner()) || isSettled(attempt)) return;
        attempt.setLeaseOwner(null); attempt.setLeaseUntil(null);
        if (result.verified() && result.success() && result.transactionId() != null && !result.transactionId().isBlank() && result.amount() != null &&
                result.amount().compareTo(attempt.getAmount()) == 0) {
            settle(attempt, order, result.transactionId(), result.rawPayload());
        } else if (result.verified() && result.terminalFailure() && result.amount() != null &&
                result.amount().compareTo(attempt.getAmount()) == 0) {
            attempt.setState(PaymentAttempt.State.FAILED); attempt.setRawPayload(result.rawPayload());
            audit(attempt, PaymentLog.EventType.FAILED, result.transactionId(), result.rawPayload());
        } else {
            if (attempt.getState() == PaymentAttempt.State.PROCESSING) attempt.setState(PaymentAttempt.State.UNKNOWN);
            attempt.setQueryCount(attempt.getQueryCount() + 1);
            attempt.setNextQueryAt(OffsetDateTime.now().plusSeconds(Math.min(300, 30L * attempt.getQueryCount())));
            // Persist an explicit operator backlog; never silently abandon uncertain money.
            if (attempt.getQueryCount() >= 288 || attempt.getExpiresAt().plusDays(1).isBefore(OffsetDateTime.now())) {
                attempt.setState(PaymentAttempt.State.REVIEW_REQUIRED);
                attempt.setLastError("Unresolved after bounded provider reconciliation; operator review required");
            }
        }
    }

    private PaymentInitiationResponse response(PaymentAttempt attempt, OrderView order) {
        boolean payable = "AWAITING_PAYMENT".equals(order.status()) && order.expiresAt().isAfter(OffsetDateTime.now());
        return new PaymentInitiationResponse(order.id(), attempt.getProvider().name(),
                attempt.getProvider() == PaymentLog.Provider.VNPAY ? order.id().toString() : attempt.getRequestId(),
                payable && attempt.getState() == PaymentAttempt.State.READY ? attempt.getPaymentUrl() : null,
                attempt.getId(), attempt.getState().name());
    }
    public record Prepared(OrderView order, String requestId, boolean callGateway, PaymentInitiationResponse response) {}
    public record QueryClaim(UUID orderId, PaymentLog.Provider provider, String requestId, String payload, UUID owner) {}
}
