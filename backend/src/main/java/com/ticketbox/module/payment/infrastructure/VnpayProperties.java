package com.ticketbox.module.payment.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ticketbox.payment.vnpay")
public record VnpayProperties(
        String payUrl,
        String returnUrl,
        String ipnUrl,
        String tmnCode,
        String hashSecret,
        String locale,
        String orderType
) {
    public String localeOrDefault() {
        return locale == null || locale.isBlank() ? "vn" : locale;
    }

    public String orderTypeOrDefault() {
        return orderType == null || orderType.isBlank() ? "other" : orderType;
    }
}
