package com.ticketbox.payments.application.error;

/** Only for failures proven to happen before any request can reach the provider. */
public class GatewayNotSubmittedException extends AppException {
    public GatewayNotSubmittedException(String message) {
        super(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE, message);
    }
}
