package org.ticketbox.ticketing.integration.payment;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.port.payment.PaymentIntent;
import org.ticketbox.ticketing.application.port.payment.PaymentWorkflowPort;
import org.ticketbox.ticketing.infrastructure.integration.payment.PaymentIntentDispatcher;
import org.ticketbox.ticketing.infrastructure.integration.payment.PaymentRemoteClient;
import org.ticketbox.ticketing.payment.application.RemotePaymentOperations;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth.Path;

import java.util.List;
import java.util.UUID;

class ProductionPaymentBoundaryTest {
    @Test
    void dispatcherReportsTransportFailuresWithoutTreatingBusinessConflictsAsOverload() {
        var workflow = mock(PaymentWorkflowPort.class);
        var remote = mock(PaymentRemoteClient.class);
        var health = mock(AdmissionHealth.class);
        var unavailable = new PaymentWorkflowPort.Claim(mock(PaymentIntent.class), UUID.randomUUID());
        var conflict = new PaymentWorkflowPort.Claim(mock(PaymentIntent.class), UUID.randomUUID());
        when(workflow.claim(2)).thenReturn(List.of(unavailable, conflict));
        when(remote.submit(unavailable.intent())).thenThrow(new ResourceAccessException("timeout"));
        when(remote.submit(conflict.intent())).thenThrow(new HttpClientErrorException(HttpStatus.CONFLICT));

        new PaymentIntentDispatcher(workflow, remote, health).dispatch();

        verify(health).record(null, Path.PAYMENT, false, true, true);
        verifyNoMoreInteractions(health);
        verify(workflow).failed(unavailable, "ResourceAccessException");
        verify(workflow).failed(conflict, "HttpClientErrorException");
    }

    @Test
    void stagingRejectsMomoBeforeCreatingAnIntent() {
        var workflow = mock(PaymentWorkflowPort.class);
        var remote = mock(PaymentRemoteClient.class);
        var environment = new MockEnvironment();
        environment.setActiveProfiles("staging");
        var operations = new RemotePaymentOperations(workflow, remote, environment);

        assertThatThrownBy(() -> operations.initiatePayment(UUID.randomUUID(), "MOMO", UUID.randomUUID()))
                .isInstanceOf(AppException.class);
        verifyNoInteractions(workflow, remote);
    }

    @Test
    void productionRejectsDefaultAndExplicitMockBeforeCreatingAnIntentOrCallingPayment() {
        var workflow = mock(PaymentWorkflowPort.class);
        var remote = mock(PaymentRemoteClient.class);
        var environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        var operations = new RemotePaymentOperations(workflow, remote, environment);
        UUID order = UUID.randomUUID();
        UUID user = UUID.randomUUID();

        assertThatThrownBy(() -> operations.initiatePayment(order, null, user))
                .isInstanceOf(AppException.class)
                .hasMessage("error.payment.mock-disabled");
        assertThatThrownBy(() -> operations.initiatePayment(order, " mock ", user))
                .isInstanceOf(AppException.class)
                .hasMessage("error.payment.mock-disabled");
        assertThatThrownBy(() -> operations.processMockPaymentSuccess(order))
                .isInstanceOf(AppException.class)
                .hasMessage("error.payment.mock-disabled");
        assertThatThrownBy(() -> operations.processMockPaymentFail(order))
                .isInstanceOf(AppException.class)
                .hasMessage("error.payment.mock-disabled");
        verifyNoInteractions(workflow, remote);
    }
}
