package com.ticketbox.module.payment.application;

import com.ticketbox.module.payment.application.gateway.*;
import com.ticketbox.module.payment.domain.*;
import com.ticketbox.module.ticket.*;
import com.ticketbox.module.payment.web.dto.PaymentInitiationResponse;
import com.ticketbox.shared.exception.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentServiceInitiationTest {
    private final PaymentAttemptTransactions transactions = mock(PaymentAttemptTransactions.class);
    private final PaymentGatewayResolver gateways = mock(PaymentGatewayResolver.class);
    private final PaymentService service = new PaymentService(transactions, mock(PaymentAttemptRepository.class),
            mock(OrderPort.class), gateways, new PaymentGatewayExecutor(1, 1));
    private final UUID orderId = UUID.randomUUID(), user = UUID.randomUUID();
    private final OrderView order = new OrderView(orderId,user,BigDecimal.TEN,"AWAITING_PAYMENT",null,null,null);

    @Test void reusesPersistedAttemptWithoutGatewayCall() {
        var response = new PaymentInitiationResponse(orderId,"MOMO","stable", "https://pay",UUID.randomUUID(),"READY");
        when(transactions.prepare(orderId,user,PaymentLog.Provider.MOMO))
                .thenReturn(new PaymentAttemptTransactions.Prepared(order,"stable",false,response));
        assertThat(service.initiatePayment(orderId,"MOMO",user)).isSameAs(response);
        verify(gateways).resolve(PaymentLog.Provider.MOMO);
        verifyNoMoreInteractions(gateways);
    }
    @Test void deniedOrderNeverContactsGateway() {
        when(transactions.prepare(orderId,user,PaymentLog.Provider.MOMO))
                .thenThrow(new AppException(ErrorCode.ORDER_NOT_FOUND,"denied"));
        assertThatThrownBy(() -> service.initiatePayment(orderId,"MOMO",user)).isInstanceOf(AppException.class);
        verify(gateways).resolve(PaymentLog.Provider.MOMO);
        verifyNoMoreInteractions(gateways);
    }
    @Test void timeoutFinalizesUnknownUsingPersistedRequestId() {
        when(transactions.prepare(orderId,user,PaymentLog.Provider.MOMO))
                .thenReturn(new PaymentAttemptTransactions.Prepared(order,"stable",true,null));
        var gateway = mock(PaymentGateway.class);
        when(gateways.resolve(PaymentLog.Provider.MOMO)).thenReturn(gateway);
        when(gateway.initiatePayment(order,"stable")).thenThrow(new RuntimeException("timeout"));
        service.initiatePayment(orderId,"MOMO",user);
        verify(transactions).finish(orderId,"stable",null,"timeout");
    }

    @Test void unavailableProviderDoesNotCreateOrLockAnAttempt() {
        when(gateways.resolve(PaymentLog.Provider.MOCK))
                .thenThrow(new AppException(ErrorCode.INVALID_REQUEST, "MOCK disabled"));
        assertThatThrownBy(() -> service.initiatePayment(orderId, null, user)).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> service.initiatePayment(orderId, "mock", user)).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> service.processMockPaymentSuccess(orderId)).isInstanceOf(AppException.class);
        verifyNoInteractions(transactions);
    }
}
