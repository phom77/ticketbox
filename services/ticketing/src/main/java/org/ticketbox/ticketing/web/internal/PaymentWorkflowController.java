package org.ticketbox.ticketing.web.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.application.port.payment.PaymentAck;
import org.ticketbox.ticketing.application.port.payment.PaymentResult;
import org.ticketbox.ticketing.application.port.payment.PaymentWorkflowPort;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;
import org.ticketbox.ticketing.web.ApiResponse;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@RestController
@ConditionalOnProperty(name = "ticketbox.payments.mode", havingValue = "remote")
public class PaymentWorkflowController {
    private final PaymentWorkflowPort workflow;
    private final PaymentGatewayClient remote;
    private final byte[] token;

    public PaymentWorkflowController(
            PaymentWorkflowPort workflow,
            PaymentGatewayClient remote,
            @Value("${ticketbox.payments.service-token}") String token) {
        if (token.length() < 32) throw new IllegalStateException("Payment token is too short");
        this.workflow = workflow;
        this.remote = remote;
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/internal/ticketing/payment-results")
    public PaymentAck receive(
            @RequestHeader(value = "X-Service-Token", required = false) String supplied,
            @RequestBody PaymentResult result) {
        if (supplied == null
                || !MessageDigest.isEqual(token, supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return workflow.receive(result);
    }

    @GetMapping("/api/admin/payment-workflows/reviews")
    public Object reviews() {
        return ApiResponse.success(remote.reviews());
    }

    @PostMapping("/api/admin/payment-workflows/{order}/review")
    public Object review(
            @PathVariable UUID order, @RequestBody Map<String, Object> body, Authentication auth) {
        var request = new HashMap<>(body);
        request.put("actorId", auth.getName());
        return ApiResponse.success(remote.review(order, request));
    }
}
