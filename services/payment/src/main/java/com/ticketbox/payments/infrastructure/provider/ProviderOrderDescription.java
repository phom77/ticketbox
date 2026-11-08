package com.ticketbox.payments.infrastructure.provider;

import java.util.Locale;
import java.util.ResourceBundle;

final class ProviderOrderDescription {
    // These protocol values are part of the signed payload.
    private static final ResourceBundle DESCRIPTIONS =
            ResourceBundle.getBundle("provider-order-descriptions", Locale.ROOT);

    private ProviderOrderDescription() {}

    static String forMomo(String orderId) {
        return DESCRIPTIONS.getString("momo") + orderId;
    }

    static String forVnpay(String providerReference) {
        return DESCRIPTIONS.getString("vnpay") + providerReference;
    }
}
