package com.ticketbox.infrastructure.redis;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties(prefix = "ticketbox.rate-limit")
public record RateLimitProperties(
        @Valid @NotNull Policy purchase,
        @Valid @NotNull Policy payment,
        @Valid Policy globalPurchase,
        @Valid Policy globalPayment,
        @Valid Policy callback
) {
    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public RateLimitProperties {
        if (globalPurchase == null) globalPurchase = new Policy(32, 16, Duration.ofSeconds(1));
        if (globalPayment == null) globalPayment = new Policy(16, 8, Duration.ofSeconds(1));
        if (callback == null) callback = new Policy(128, 64, Duration.ofSeconds(1));
    }
    public RateLimitProperties(Policy purchase, Policy payment) {
        this(purchase, payment, null, null, null);
    }
    public record Policy(
            @Min(1) long capacity,
            @Min(1) long refillTokens,
            @NotNull Duration refillPeriod
    ) {
    }
}
