package com.ticketbox.payments.provider;

import com.ticketbox.payments.provider.AppException;
import com.ticketbox.payments.provider.ErrorCode;

/** Only for failures proven to happen before any request can reach the provider. */
public class GatewayNotSubmittedException extends AppException {
    public GatewayNotSubmittedException(String message) { super(ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE,message); }
}
