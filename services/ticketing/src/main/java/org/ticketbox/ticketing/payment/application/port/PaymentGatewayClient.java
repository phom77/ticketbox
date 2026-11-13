package org.ticketbox.ticketing.payment.application.port;

import org.ticketbox.ticketing.application.port.payment.PaymentIntent;
import org.ticketbox.ticketing.application.port.payment.PaymentSnapshot;

import java.util.*;

public interface PaymentGatewayClient {
    PaymentSnapshot submit(PaymentIntent intent);

    List<String> availableProviders();

    void mock(UUID order, boolean success);

    Map webhook(String provider, Map<String, String> body);

    Object reviews();

    PaymentSupport support(UUID order);

    org.ticketbox.ticketing.order.application.port.OrderSupportQueue.Page pendingRefunds(int page, int size);

    Object review(UUID order, Map<String, Object> body);

    record PaymentSupport(Attempt attempt, List<Review> cases) {}
    record Attempt(String state, String provider, long requestedAmount, String transactionId, java.time.OffsetDateTime verifiedAt) {}
    record Review(UUID id, String state, long amount, String externalReference, java.time.OffsetDateTime recordedAt,
                  UUID requestedBy, UUID approvedBy, java.time.OffsetDateTime occurredAt) {}
}
