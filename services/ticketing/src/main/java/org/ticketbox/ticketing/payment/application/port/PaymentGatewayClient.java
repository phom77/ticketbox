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

    Object review(UUID order, Map<String, Object> body);
}
