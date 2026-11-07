package com.ticketbox.payments.application.port;

import com.ticketbox.payments.domain.Provider;

public interface PaymentGateways {
    PaymentGateway resolve(Provider provider);
}
