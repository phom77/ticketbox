package org.ticketbox.ticketing.reporting.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.reporting.application.ReconciliationService;
import org.ticketbox.ticketing.reporting.application.port.ReconciliationStore.Snapshot;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@ConditionalOnProperty(name = "ticketbox.payments.mode", havingValue = "remote")
class PaymentReconciliationReceiver {
    private final ReconciliationService service;
    private final byte[] token;

    PaymentReconciliationReceiver(ReconciliationService service,
            @Value("${ticketbox.payments.service-token}") String token) {
        if (token.length() < 32) throw new IllegalStateException("Payment token is too short");
        this.service = service;
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/internal/ticketing/payment-reconciliation")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void receive(@RequestHeader(value = "X-Service-Token", required = false) String supplied,
            @RequestBody Snapshot snapshot) {
        if (supplied == null || !MessageDigest.isEqual(token, supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        service.receive(snapshot);
    }
}
