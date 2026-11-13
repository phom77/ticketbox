package org.ticketbox.ticketing.order.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.order.application.OrderRefundService;
import org.ticketbox.ticketing.order.application.RefundOrderEffects;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.web.ApiResponse;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@RestController
class OrderRefundController {
    private final OrderRefundService refunds;
    private final byte[] token;

    OrderRefundController(OrderRefundService refunds, @Value("${ticketbox.payments.service-token}") String token) {
        this.refunds = refunds;
        this.token = token.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/api/admin/orders/{order}/refunds")
    ApiResponse<RefundProviders.Case> decide(@PathVariable UUID order, @RequestBody OrderRefundService.Request request,
            Authentication auth) {
        return ApiResponse.success(refunds.decide(order, UUID.fromString(auth.getName()), request));
    }

    @PostMapping("/internal/ticketing/refund-results")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void receive(@RequestHeader(value = "X-Service-Token", required = false) String supplied,
            @RequestBody RefundOrderEffects.Result result) {
        if (token.length < 32 || supplied == null || !MessageDigest.isEqual(token, supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        refunds.receive(result);
    }
}
