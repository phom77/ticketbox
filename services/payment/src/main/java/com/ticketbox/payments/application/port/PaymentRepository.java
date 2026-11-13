package com.ticketbox.payments.application.port;

import com.ticketbox.payments.application.dto.PaymentContract.*;
import com.ticketbox.payments.domain.OrderView;
import com.ticketbox.payments.domain.PaymentInitiationResult;
import com.ticketbox.payments.domain.PaymentQueryResult;
import com.ticketbox.payments.domain.PaymentWebhookResult;
import com.ticketbox.payments.domain.Provider;

import java.util.*;

public interface PaymentRepository {
    Attempt find(UUID order);

    Attempt prepare(Intent i);

    boolean start(UUID order);

    void created(UUID order, PaymentInitiationResult result, String error, boolean unsent);

    WebhookAck receive(Provider provider, PaymentWebhookResult receipt, String requestId);

    List<Delivery> claimResults(int limit);

    void acknowledged(Delivery delivery, Ack ack);

    void deliveryFailed(Delivery d, String error);

    List<Attempt> claimQueries(int limit);

    void queryUnknown(Attempt a);

    void queryResult(Attempt a, PaymentQueryResult result);

    Object reviews();

    Object support(UUID order);

    Object pendingRefunds(int page, int size);

    Object review(UUID order, UUID action, UUID actor, String kind, String detail, UUID caseId);

    void transactionConflict(UUID order);

    public record Attempt(
            UUID id,
            Intent intent,
            String state,
            String url,
            String raw,
            String transaction,
            UUID lease) {
        public com.ticketbox.payments.domain.PaymentAttempt aggregate() {
            return new com.ticketbox.payments.domain.PaymentAttempt(
                    intent.intentId(),
                    intent.orderId(),
                    Provider.valueOf(intent.provider()),
                    intent.requestId(),
                    intent.amount(),
                    com.ticketbox.payments.domain.PaymentAttempt.State.valueOf(state),
                    transaction);
        }

        public OrderView order() {
            return new OrderView(
                    intent.orderId(),
                    intent.userId(),
                    intent.amount(),
                    "AWAITING_PAYMENT",
                    intent.provider(),
                    intent.requestId(),
                    url,
                    intent.expiresAt());
        }

        public Snapshot snapshot() {
            return new Snapshot(
                    id,
                    state,
                    url,
                    Provider.VNPAY.name().equals(intent.provider())
                            ? intent.orderId().toString()
                            : intent.requestId());
        }
    }

    public record Delivery(UUID id, String payload, UUID owner) {}
}
