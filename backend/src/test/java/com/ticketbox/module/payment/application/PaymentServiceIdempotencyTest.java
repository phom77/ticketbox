package com.ticketbox.module.payment.application;

import com.ticketbox.module.payment.application.gateway.*;
import com.ticketbox.module.payment.domain.*;
import com.ticketbox.module.ticket.*;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaymentServiceIdempotencyTest {
    private final PaymentAttemptRepository attempts = mock(PaymentAttemptRepository.class);
    private final PaymentLogRepository logs = mock(PaymentLogRepository.class);
    private final OrderPort orders = mock(OrderPort.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final PaymentAttemptTransactions tx = new PaymentAttemptTransactions(attempts,logs,orders,events);
    private final UUID orderId = UUID.randomUUID(), user = UUID.randomUUID();

    private PaymentAttempt fixture() {
        PaymentAttempt attempt = new PaymentAttempt(); attempt.setOrderId(orderId);
        attempt.setProvider(PaymentLog.Provider.MOMO); attempt.setRequestId("stable");
        attempt.setState(PaymentAttempt.State.PROCESSING); attempt.setAmount(BigDecimal.TEN);
        when(attempts.findByOrderId(orderId)).thenReturn(Optional.of(attempt));
        when(orders.lockOrder(orderId)).thenReturn(Optional.of(new OrderView(orderId,user,BigDecimal.TEN,
                "AWAITING_PAYMENT",null,null,null)));
        return attempt;
    }
    private PaymentWebhookResult receipt(boolean success) {
        return new PaymentWebhookResult(true,success,orderId,"provider-txn",BigDecimal.TEN,"{}",null);
    }
    @Test void earlyCallbackSettlesOnceAndFinalizeCannotOverwriteSuccess() {
        var attempt = fixture(); when(orders.settlePayment(orderId,"MOMO","provider-txn")).thenReturn(true);
        assertThat(tx.receive(PaymentLog.Provider.MOMO,receipt(true),"stable").responseCode()).isEqualTo("00");
        assertThat(tx.receive(PaymentLog.Provider.MOMO,receipt(true),"stable").responseCode()).isEqualTo("02");
        tx.finish(orderId,"stable",new PaymentInitiationResult(PaymentLog.Provider.MOMO,"https://pay","stable","{}"),null);
        assertThat(attempt.getState()).isEqualTo(PaymentAttempt.State.SUCCEEDED);
        verify(orders,times(1)).settlePayment(orderId,"MOMO","provider-txn");
        verify(events,times(1)).publishEvent(any(Object.class));
        verify(orders,never()).markPaymentInitiated(any(),any(),any(),any());
    }
    @Test void lateMoneyIsDurableWithoutIssuingTicketsOrSuccessEvent() {
        var attempt = fixture();
        tx.receive(PaymentLog.Provider.MOMO,receipt(true),"stable");
        assertThat(attempt.getState()).isEqualTo(PaymentAttempt.State.RECONCILIATION_REQUIRED);
        assertThat(attempt.getProviderTransactionId()).isEqualTo("provider-txn");
        verifyNoInteractions(events); verify(logs).save(any());
    }
    @Test void incorrectRequestIdOrAmountCannotSettle() {
        var attempt = fixture();
        assertThat(tx.receive(PaymentLog.Provider.MOMO,receipt(true),"other").responseCode()).isEqualTo("01");
        var wrong = new PaymentWebhookResult(true,true,orderId,"txn",BigDecimal.ONE,"{}",null);
        assertThat(tx.receive(PaymentLog.Provider.MOMO,wrong,"stable").responseCode()).isEqualTo("04");
        verify(orders,never()).settlePayment(any(),any(),any());
        assertThat(attempt.getState()).isEqualTo(PaymentAttempt.State.PROCESSING);
    }
    @Test void pendingReceiptKeepsQueryRecoveryActive() {
        var attempt = fixture();
        var pending = new PaymentWebhookResult(true,false,orderId,"txn",BigDecimal.TEN,"{}",null,true);
        assertThat(tx.receive(PaymentLog.Provider.MOMO,pending,"stable").responseCode()).isEqualTo("00");
        assertThat(attempt.getState()).isEqualTo(PaymentAttempt.State.UNKNOWN);
        assertThat(attempt.getNextQueryAt()).isNotNull();
        verify(orders,never()).settlePayment(any(),any(),any());
    }
    @Test void provenUnsentAttemptCanRetryWithTheSameIdentity() {
        var attempt = fixture();
        tx.notSubmitted(orderId,"stable","circuit open");
        assertThat(attempt.getState()).isEqualTo(PaymentAttempt.State.CREATED);
        when(orders.getPayableOrderForUser(orderId,user)).thenReturn(new OrderView(orderId,user,BigDecimal.TEN,"AWAITING_PAYMENT",null,null,null));
        var retry=tx.prepare(orderId,user,PaymentLog.Provider.MOMO);
        assertThat(retry.requestId()).isEqualTo("stable"); assertThat(retry.callGateway()).isTrue();
    }

    @Test void verifiedFinalQueryFailureStopsRecoveryWithoutTickets() {
        var attempt=fixture(); var owner=UUID.randomUUID(); attempt.setLeaseOwner(owner);
        var claim=new PaymentAttemptTransactions.QueryClaim(orderId,PaymentLog.Provider.MOMO,"stable",null,owner);
        tx.finishQuery(claim,new PaymentQueryResult(true,false,"txn",BigDecimal.TEN,"{}",true));
        assertThat(attempt.getState()).isEqualTo(PaymentAttempt.State.FAILED);
        assertThat(attempt.getLeaseOwner()).isNull();
        verify(orders,never()).settlePayment(any(),any(),any()); verifyNoInteractions(events);
    }

}
