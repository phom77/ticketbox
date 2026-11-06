package org.ticketbox.ticketing.integration.payment;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.ticketbox.ticketing.web.AppException;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class ProductionPaymentBoundaryTest {
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
                .isInstanceOf(AppException.class).hasMessageContaining("MOCK");
        assertThatThrownBy(() -> operations.initiatePayment(order, " mock ", user))
                .isInstanceOf(AppException.class).hasMessageContaining("MOCK");
        assertThatThrownBy(() -> operations.processMockPaymentSuccess(order))
                .isInstanceOf(AppException.class).hasMessageContaining("MOCK");
        assertThatThrownBy(() -> operations.processMockPaymentFail(order))
                .isInstanceOf(AppException.class).hasMessageContaining("MOCK");
        verifyNoInteractions(workflow, remote);
    }
}
