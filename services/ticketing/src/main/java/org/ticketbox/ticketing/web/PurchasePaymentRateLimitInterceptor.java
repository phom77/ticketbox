package org.ticketbox.ticketing.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.HandlerInterceptor;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.config.RateLimitProperties;
import org.ticketbox.ticketing.infrastructure.redis.RedisKeyConstants;
import org.ticketbox.ticketing.infrastructure.redis.TokenBucketRateLimiter;

import java.util.Locale;

@RequiredArgsConstructor
public class PurchasePaymentRateLimitInterceptor implements HandlerInterceptor {
    private final TokenBucketRateLimiter rateLimiter;
    private final RateLimitProperties properties;

    public boolean preHandle(
            HttpServletRequest request, HttpServletResponse response, Object handler) {
        boolean callback = request.getRequestURI().startsWith("/api/payments/webhooks/");
        boolean performanceHold = request.getRequestURI().startsWith("/api/v2/performances/")
                && request.getRequestURI().endsWith("/hold") && "PUT".equals(request.getMethod());
        if (!"POST".equalsIgnoreCase(request.getMethod()) && !performanceHold && !callback) {
            return true;
        }

        Bucket bucket = resolveBucket(request.getRequestURI());
        if (bucket == null) {
            return true;
        }

        if (callback) {
            // Dedicated shared budget, independent of customer/IP limits. Do not acknowledge a
            // dropped receipt.
            if (!rateLimiter.tryConsume("rate-limit:global:callback", properties.callback())) {
                throw new AppException(
                        ErrorCode.RATE_LIMIT_EXCEEDED, "Callback capacity exceeded; retry receipt");
            }
            return true;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        String redisKey;
        if (authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)) {
            redisKey =
                    RedisKeyConstants.RATE_LIMIT_USER
                            + authentication.getName()
                            + ":"
                            + bucket.name().toLowerCase(Locale.ROOT);
        } else {
            redisKey =
                    RedisKeyConstants.RATE_LIMIT_IP
                            + request.getRemoteAddr()
                            + ":"
                            + bucket.name().toLowerCase(Locale.ROOT);
        }

        RateLimitProperties.Policy policy =
                switch (bucket) {
                    case PURCHASE -> properties.purchase();
                    case RELEASE -> properties.release();
                    case PAYMENT -> properties.payment();
                };

        if (!rateLimiter.tryConsume(redisKey, policy)) {
            throw new AppException(
                    ErrorCode.RATE_LIMIT_EXCEEDED, "Too many requests. Please retry later.");
        }
        if (bucket == Bucket.RELEASE) {
            // Releases return stock and do not compete for inventory, so they skip the global
            // purchase throttle.
            return true;
        }

        RateLimitProperties.Policy global =
                bucket == Bucket.PURCHASE
                        ? properties.globalPurchase()
                        : properties.globalPayment();
        if (!rateLimiter.tryConsume(
                "rate-limit:global:" + bucket.name().toLowerCase(Locale.ROOT), global)) {
            request.setAttribute(PurchaseAdmissionHealthInterceptor.GLOBAL_THROTTLE, true);
            throw new AppException(ErrorCode.RATE_LIMIT_EXCEEDED, "error.rate-limit.service-busy");
        }
        return true;
    }

    private Bucket resolveBucket(String uri) {
        if (uri.startsWith("/api/reservations/") && uri.endsWith("/release")) {
            return Bucket.RELEASE;
        }
        if ("/api/orders".equals(uri) || uri.startsWith("/api/reservations/")
                || (uri.startsWith("/api/v2/performances/") && (uri.endsWith("/hold") || uri.endsWith("/orders")))) {
            return Bucket.PURCHASE;
        }

        if (uri.startsWith("/api/mock-payments/") || uri.startsWith("/api/payments/")) {
            return Bucket.PAYMENT;
        }

        return null;
    }

    private enum Bucket {
        PURCHASE,
        RELEASE,
        PAYMENT
    }
}
