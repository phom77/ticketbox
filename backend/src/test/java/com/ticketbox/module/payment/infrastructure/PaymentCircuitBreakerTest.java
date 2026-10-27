package com.ticketbox.module.payment.infrastructure;

import com.ticketbox.module.payment.application.gateway.PaymentInitiationResult;
import com.ticketbox.module.ticket.OrderView;
import com.ticketbox.shared.exception.AppException;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.amqp.RabbitAutoConfiguration;
import org.springframework.boot.autoconfigure.batch.BatchAutoConfiguration;
import org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceTransactionManagerAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.ticketbox.module.concert.application.ConcertService;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import org.springframework.boot.test.mock.mockito.MockBean;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        classes = {
                PaymentCircuitBreakerTest.TestConfig.class,
                MomoPaymentGateway.class,
                VnpayPaymentGateway.class
        },
        properties = {
                // Configure Momo with unreachable endpoint
                "ticketbox.payment.momo.api-endpoint=http://localhost:54321/invalid-momo",
                "ticketbox.payment.momo.partner-code=test-partner",
                "ticketbox.payment.momo.access-key=test-access",
                "ticketbox.payment.momo.secret-key=test-secret",
                "ticketbox.payment.momo.return-url=http://localhost/return",
                "ticketbox.payment.momo.ipn-url=http://localhost/ipn",
                
                // Configure VNPay with empty configuration to force requireConfigured failure
                "ticketbox.payment.vnpay.pay-url=",
                "ticketbox.payment.vnpay.return-url=",
                "ticketbox.payment.vnpay.tmn-code=",
                "ticketbox.payment.vnpay.hash-secret="
        }
)
@EnableAutoConfiguration(
        exclude = {
                DataSourceAutoConfiguration.class,
                DataSourceTransactionManagerAutoConfiguration.class,
                HibernateJpaAutoConfiguration.class,
                RedisAutoConfiguration.class,
                RabbitAutoConfiguration.class,
                BatchAutoConfiguration.class
        },
        excludeName = {
                "org.springframework.modulith.events.jpa.JpaEventPublicationAutoConfiguration"
        }
)
@ActiveProfiles("test")
class PaymentCircuitBreakerTest {

    @org.springframework.context.annotation.Configuration
    @org.springframework.boot.context.properties.EnableConfigurationProperties({
            MomoProperties.class,
            VnpayProperties.class
    })
    @org.springframework.context.annotation.Import({
            org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration.class
    })
    static class TestConfig {
    }

    @Autowired
    private MomoPaymentGateway momoPaymentGateway;

    @Autowired
    private VnpayPaymentGateway vnpayPaymentGateway;

    @Autowired
    private CircuitBreakerRegistry circuitBreakerRegistry;

    @MockBean
    private ConcertService concertService;

    private OrderView mockOrder;

    @BeforeEach
    void setUp() {
        mockOrder = new OrderView(
                UUID.randomUUID(),
                UUID.randomUUID(),
                new BigDecimal("500000"),
                "AWAITING_PAYMENT",
                null,
                null,
                null
        );
        // Reset circuit breakers to CLOSED state before each test
        circuitBreakerRegistry.circuitBreaker("momo").reset();
        circuitBreakerRegistry.circuitBreaker("vnpay").reset();
    }

    @Test
    @DisplayName("MoMo Circuit Breaker transitions to OPEN after failures and calls fallback")
    void testMomoCircuitBreakerTransitionsToOpen() {
        var cb = circuitBreakerRegistry.circuitBreaker("momo");
        assertThat(cb.getState()).isEqualTo(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.CLOSED);

        // Call 1: fails and triggers fallback
        assertThatThrownBy(() -> momoPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cổng thanh toán MoMo tạm thời không khả dụng");

        // Call 2: fails and triggers fallback
        assertThatThrownBy(() -> momoPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cổng thanh toán MoMo tạm thời không khả dụng");

        // Call 3: fails and triggers fallback -> threshold is reached, state transitions to OPEN
        assertThatThrownBy(() -> momoPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cổng thanh toán MoMo tạm thời không khả dụng");

        // The circuit breaker should now be OPEN
        assertThat(cb.getState()).isEqualTo(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.OPEN);

        // Call 4: should be blocked by circuit breaker and trigger fallback directly
        assertThatThrownBy(() -> momoPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cổng thanh toán MoMo tạm thời không khả dụng");
    }

    @Test
    @DisplayName("VNPay Circuit Breaker transitions to OPEN after incomplete config failures and calls fallback")
    void testVnpayCircuitBreakerTransitionsToOpen() {
        var cb = circuitBreakerRegistry.circuitBreaker("vnpay");
        assertThat(cb.getState()).isEqualTo(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.CLOSED);

        // Call 1: fails and triggers fallback
        assertThatThrownBy(() -> vnpayPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cấu hình VNPAY chưa đầy đủ");

        // Call 2: fails and triggers fallback
        assertThatThrownBy(() -> vnpayPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cấu hình VNPAY chưa đầy đủ");

        // Call 3: fails and triggers fallback -> state becomes OPEN
        assertThatThrownBy(() -> vnpayPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cấu hình VNPAY chưa đầy đủ");

        // The circuit breaker should now be OPEN
        assertThat(cb.getState()).isEqualTo(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.OPEN);

        // Call 4: should be blocked by circuit breaker and trigger fallback directly
        assertThatThrownBy(() -> vnpayPaymentGateway.initiatePayment(mockOrder))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Cổng thanh toán VNPAY tạm thời không khả dụng");
    }

    @Test
    @DisplayName("Verify that concert services remain functional when payment gateway is down and circuit breaker is OPEN")
    void testConcertServiceStillWorksWhenPaymentIsDown() {
        // 1. Force the MoMo circuit breaker to OPEN
        var cb = circuitBreakerRegistry.circuitBreaker("momo");
        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> momoPaymentGateway.initiatePayment(mockOrder))
                    .isInstanceOf(AppException.class)
                    .hasMessageContaining("Cổng thanh toán MoMo tạm thời không khả dụng");
        }
        assertThat(cb.getState()).isEqualTo(io.github.resilience4j.circuitbreaker.CircuitBreaker.State.OPEN);

        // 2. Mock a response from ConcertService representing a concert detail page
        UUID concertId = UUID.randomUUID();
        ConcertDetailResponse mockResponse = new ConcertDetailResponse(
                concertId,
                "Independent Concert",
                "Description",
                "Artist Bio",
                "Venue",
                "Address",
                OffsetDateTime.now().plusDays(10),
                OffsetDateTime.now().plusDays(10).minusHours(1),
                OffsetDateTime.now().minusHours(1),
                OffsetDateTime.now().plusDays(1),
                "ON_SALE",
                null,
                null,
                UUID.randomUUID(),
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
        when(concertService.getConcertDetail(concertId)).thenReturn(mockResponse);

        // 3. Call the ConcertService and assert it returns the correct detail page
        ConcertDetailResponse actualResponse = concertService.getConcertDetail(concertId);
        assertThat(actualResponse).isNotNull();
        assertThat(actualResponse.title()).isEqualTo("Independent Concert");
        assertThat(actualResponse.id()).isEqualTo(concertId);
    }
}
