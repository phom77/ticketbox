package com.ticketbox.module.payment.application.gateway;

import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.springframework.stereotype.Component;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Component
public class PaymentGatewayResolver {
    private final Map<PaymentLog.Provider, PaymentGateway> gateways;
    private final boolean production;

    public PaymentGatewayResolver(List<PaymentGateway> gatewayList, Environment environment) {
        this.production = environment.acceptsProfiles(Profiles.of("prod"));
        this.gateways = new EnumMap<>(PaymentLog.Provider.class);
        for (PaymentGateway gateway : gatewayList) {
            this.gateways.put(gateway.provider(), gateway);
        }
    }

    public PaymentGateway resolve(PaymentLog.Provider provider) {
        if (production && provider == PaymentLog.Provider.MOCK) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Thanh toán MOCK không được phép trong production");
        }
        PaymentGateway gateway = gateways.get(provider);
        if (gateway == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Nhà cung cấp thanh toán không được hỗ trợ: " + provider);
        }
        return gateway;
    }
}
