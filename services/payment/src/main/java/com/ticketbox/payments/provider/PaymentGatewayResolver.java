package com.ticketbox.payments.provider;

import com.ticketbox.payments.provider.Provider;
import com.ticketbox.payments.provider.AppException;
import com.ticketbox.payments.provider.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class PaymentGatewayResolver {
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
            throw new AppException(ErrorCode.INVALID_REQUEST, "Thanh toán MOCK không được phép trong production");
        }
        PaymentGateway gateway = gateways.get(provider);
        if (gateway == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Nhà cung cấp thanh toán không được hỗ trợ: " + provider);
        }
        return gateway;
    }
}
