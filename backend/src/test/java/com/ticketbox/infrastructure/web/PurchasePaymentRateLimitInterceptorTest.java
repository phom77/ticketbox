package com.ticketbox.infrastructure.web;

import com.ticketbox.infrastructure.redis.RateLimitProperties;
import com.ticketbox.infrastructure.redis.TokenBucketRateLimiter;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import com.ticketbox.shared.util.RedisKeyConstants;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PurchasePaymentRateLimitInterceptorTest {

    @Mock
    private TokenBucketRateLimiter rateLimiter;

    private RateLimitProperties properties;
    private PurchasePaymentRateLimitInterceptor interceptor;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    private RateLimitProperties.Policy purchasePolicy;
    private RateLimitProperties.Policy paymentPolicy;

    @BeforeEach
    void setUp() {
        purchasePolicy = new RateLimitProperties.Policy(5, 1, Duration.ofSeconds(1));
        paymentPolicy = new RateLimitProperties.Policy(10, 1, Duration.ofSeconds(1));
        properties = new RateLimitProperties(purchasePolicy, paymentPolicy);
        
        interceptor = new PurchasePaymentRateLimitInterceptor(rateLimiter, properties);
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void preHandle_NotPostRequest_ShouldReturnTrue() {
        request.setMethod("GET");
        request.setRequestURI("/api/orders");

        boolean result = interceptor.preHandle(request, response, new Object());

        assertTrue(result);
        verifyNoInteractions(rateLimiter);
    }

    @Test
    void preHandle_NotRateLimitedUri_ShouldReturnTrue() {
        request.setMethod("POST");
        request.setRequestURI("/api/some-other-endpoint");

        boolean result = interceptor.preHandle(request, response, new Object());

        assertTrue(result);
        verifyNoInteractions(rateLimiter);
    }

    @Test
    void preHandle_PurchaseAuthenticatedUser_Allowed_ShouldReturnTrue() {
        request.setMethod("POST");
        request.setRequestURI("/api/orders");
        
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("user-123", "password", List.of(new SimpleGrantedAuthority("ROLE_USER")))
        );

        when(rateLimiter.tryConsume(eq(RedisKeyConstants.RATE_LIMIT_USER + "user-123:purchase"), eq(purchasePolicy)))
                .thenReturn(true);

        when(rateLimiter.tryConsume(org.mockito.ArgumentMatchers.startsWith("rate-limit:global:"), any())).thenReturn(true);
        boolean result = interceptor.preHandle(request, response, new Object());

        assertTrue(result);
        verify(rateLimiter, times(2)).tryConsume(any(), any());
    }

    @Test
    void preHandle_PaymentAnonymousUser_Allowed_ShouldReturnTrue() {
        request.setMethod("POST");
        request.setRequestURI("/api/payments/vnpay");
        request.setRemoteAddr("192.168.1.5");

        SecurityContextHolder.getContext().setAuthentication(
                new AnonymousAuthenticationToken("key", "anonymous", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")))
        );

        when(rateLimiter.tryConsume(eq(RedisKeyConstants.RATE_LIMIT_IP + "192.168.1.5:payment"), eq(paymentPolicy)))
                .thenReturn(true);

        when(rateLimiter.tryConsume(org.mockito.ArgumentMatchers.startsWith("rate-limit:global:"), any())).thenReturn(true);
        boolean result = interceptor.preHandle(request, response, new Object());

        assertTrue(result);
        verify(rateLimiter, times(2)).tryConsume(any(), any());
    }

    @Test
    void preHandle_RateLimitExceeded_ShouldThrowAppException429() {
        request.setMethod("POST");
        request.setRequestURI("/api/orders");
        request.setRemoteAddr("10.0.0.1");

        when(rateLimiter.tryConsume(eq(RedisKeyConstants.RATE_LIMIT_IP + "10.0.0.1:purchase"), eq(purchasePolicy)))
                .thenReturn(false);

        AppException exception = assertThrows(AppException.class, () -> 
            interceptor.preHandle(request, response, new Object())
        );

        assertEquals(ErrorCode.RATE_LIMIT_EXCEEDED, exception.getErrorCode());
        assertEquals("Too many requests. Please retry later.", exception.getMessage());
    }
}
