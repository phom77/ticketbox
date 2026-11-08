package com.ticketbox.payments.infrastructure.provider;

import com.ticketbox.payments.application.error.AppException;
import com.ticketbox.payments.application.error.ErrorCode;
import com.ticketbox.payments.application.port.PaymentGateway;
import com.ticketbox.payments.domain.Provider;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class PaymentGatewayResolver
        implements com.ticketbox.payments.application.port.PaymentGateways {
    private final Map<Provider, PaymentGateway> gateways;
    private final boolean production;

    public PaymentGatewayResolver(List<PaymentGateway> gatewayList, Environment environment) {
        this.production = environment.acceptsProfiles(Profiles.of("prod"));
        this.gateways = new EnumMap<>(Provider.class);
        for (PaymentGateway gateway : gatewayList) {
            this.gateways.put(gateway.provider(), gateway);
        }
    }

    public PaymentGateway resolve(Provider provider) {
        if (production && provider == Provider.MOCK) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST, "Mock payments are disabled in production");
        }
        PaymentGateway gateway = gateways.get(provider);
        if (gateway == null) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST, "Unsupported payment provider: " + provider);
        }
        return gateway;
    }
}
