package com.ticketbox.module.payment.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ticketbox.payment.momo")
public record MomoProperties(
        String apiEndpoint,
        String partnerCode,
        String accessKey,
        String secretKey,
        String returnUrl,
        String ipnUrl
) {
    public String apiEndpointOrDefault() {
        return apiEndpoint == null || apiEndpoint.isBlank()
                ? "https://test-payment.momo.vn/v2/gateway/api/create"
                : apiEndpoint;
    }
}
