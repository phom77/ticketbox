package com.ticketbox.module.payment.infrastructure;

import com.ticketbox.module.payment.application.gateway.PaymentGateway;
import com.ticketbox.module.payment.application.gateway.PaymentGatewayResolver;
import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.shared.exception.AppException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.env.MockEnvironment;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProductionPaymentBoundaryTest {
    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(Gateways.class);

    @Test
    void productionDoesNotRegisterMockGatewayEvenWithDevAlsoActive() {
        contexts.withPropertyValues("spring.profiles.active=prod,dev").run(context -> {
            assertThat(context).hasNotFailed().doesNotHaveBean(MockPaymentGateway.class);
            assertThatThrownBy(() -> context.getBean(PaymentGatewayResolver.class).resolve(PaymentLog.Provider.MOCK))
                    .isInstanceOf(AppException.class);
        });
    }

    @Test
    void localDevelopmentKeepsMockCheckout() {
        contexts.withPropertyValues("spring.profiles.active=dev").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(MockPaymentGateway.class);
            assertThat(context.getBean(PaymentGatewayResolver.class).resolve(PaymentLog.Provider.MOCK))
                    .isSameAs(context.getBean(MockPaymentGateway.class));
        });
    }

    @Test
    void productionGuardRejectsAnAccidentallySuppliedMockButAllowsRealProvider() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        PaymentGateway mockGateway = mock(PaymentGateway.class);
        PaymentGateway realGateway = mock(PaymentGateway.class);
        when(mockGateway.provider()).thenReturn(PaymentLog.Provider.MOCK);
        when(realGateway.provider()).thenReturn(PaymentLog.Provider.MOMO);
        var resolver = new PaymentGatewayResolver(List.of(mockGateway, realGateway), environment);
        assertThatThrownBy(() -> resolver.resolve(PaymentLog.Provider.MOCK)).isInstanceOf(AppException.class);
        assertThat(resolver.resolve(PaymentLog.Provider.MOMO)).isSameAs(realGateway);
    }

    @Configuration(proxyBeanMethods = false)
    @Import({PaymentGatewayResolver.class, MockPaymentGateway.class})
    static class Gateways {}
}
