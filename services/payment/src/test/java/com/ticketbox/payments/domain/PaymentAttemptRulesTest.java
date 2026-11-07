package com.ticketbox.payments.domain;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.UUID;

class PaymentAttemptRulesTest {
    @Test
    void sameVerifiedTransactionIsIdempotentAndDifferentMoneyIsRejected() {
        UUID order = UUID.randomUUID();
        PaymentAttempt attempt =
                new PaymentAttempt(
                        UUID.randomUUID(),
                        order,
                        Provider.MOCK,
                        "request",
                        BigDecimal.TEN,
                        PaymentAttempt.State.SUCCEEDED,
                        "transaction");
        var receipt =
                new PaymentWebhookResult(
                        true, true, order, "transaction", BigDecimal.TEN, "{}", null);
        assertEquals(
                PaymentAttempt.Decision.DUPLICATE, attempt.assess(Provider.MOCK, receipt, null));
        var otherMoney =
                new PaymentWebhookResult(
                        true, true, order, "transaction", BigDecimal.ONE, "{}", null);
        assertEquals(
                PaymentAttempt.Decision.AMOUNT_MISMATCH,
                attempt.assess(Provider.MOCK, otherMoney, null));
        var otherTransaction =
                new PaymentWebhookResult(
                        true, true, order, "different", BigDecimal.TEN, "{}", null);
        assertEquals(
                PaymentAttempt.Decision.CONFLICT,
                attempt.assess(Provider.MOCK, otherTransaction, null));
    }
}
