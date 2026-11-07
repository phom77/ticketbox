package org.ticketbox.ticketing.config;

import lombok.RequiredArgsConstructor;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.ticketbox.ticketing.infrastructure.redis.TokenBucketRateLimiter;
import org.ticketbox.ticketing.web.PurchasePaymentRateLimitInterceptor;

@Configuration
@RequiredArgsConstructor
public class WebMvcConfig implements WebMvcConfigurer {
    private final ObjectProvider<TokenBucketRateLimiter> rateLimiterProvider;
    private final ObjectProvider<RateLimitProperties> propertiesProvider;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        TokenBucketRateLimiter rateLimiter = rateLimiterProvider.getIfAvailable();
        RateLimitProperties properties = propertiesProvider.getIfAvailable();

        if (rateLimiter != null && properties != null) {
            registry.addInterceptor(
                            new PurchasePaymentRateLimitInterceptor(rateLimiter, properties))
                    .addPathPatterns(
                            "/api/orders",
                            "/api/reservations/**",
                            "/api/mock-payments/**",
                            "/api/payments/**");
        }
    }
}
