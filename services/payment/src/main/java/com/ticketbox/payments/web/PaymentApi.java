package com.ticketbox.payments.web;

import com.ticketbox.payments.application.PaymentFacade;
import com.ticketbox.payments.application.dto.PaymentContract.*;
import com.ticketbox.payments.application.error.AppException;
import com.ticketbox.payments.application.error.ErrorCode;
import com.ticketbox.payments.application.port.PaymentRepository;
import com.ticketbox.payments.domain.Provider;

import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
public class PaymentApi {
    private final PaymentFacade facade;
    private final PaymentRepository store;

    public PaymentApi(PaymentFacade facade, PaymentRepository store) {
        this.facade = facade;
        this.store = store;
    }

    @GetMapping("/internal/providers")
    public List<String> providers() {
        return facade.availableProviders();
    }

    @PostMapping("/internal/intents")
    public Snapshot create(@RequestBody Intent intent) {
        return facade.submit(intent);
    }

    @GetMapping("/internal/attempts/{order}")
    public Snapshot status(@PathVariable UUID order) {
        return store.find(order).snapshot();
    }

    @PostMapping("/internal/webhooks/{provider}")
    public WebhookAck webhook(
            @PathVariable Provider provider, @RequestBody Map<String, String> payload) {
        return facade.webhook(provider, payload);
    }

    @GetMapping("/api/payments/webhooks/vnpay")
    public Object vnpay(@RequestParam Map<String, String> payload) {
        var result = facade.webhook(Provider.VNPAY, payload);
        return Map.of("RspCode", result.responseCode(), "Message", result.message());
    }

    @PostMapping("/api/payments/webhooks/momo")
    public Object momo(@RequestBody Map<String, Object> body) {
        Map<String, String> payload = new HashMap<>();
        body.forEach((k, v) -> payload.put(k, Objects.toString(v, "")));
        var result = facade.webhook(Provider.MOMO, payload);
        return Map.of(
                "partnerCode",
                payload.getOrDefault("partnerCode", ""),
                "orderId",
                payload.getOrDefault("orderId", ""),
                "requestId",
                payload.getOrDefault("requestId", ""),
                "responseTime",
                System.currentTimeMillis(),
                "resultCode",
                List.of("00", "02").contains(result.responseCode()) ? 0 : 99,
                "message",
                result.message());
    }

    @GetMapping("/internal/reviews")
    public Object reviews() {
        return store.reviews();
    }

    public record Review(UUID actionId, UUID actorId, String action, String detail, UUID caseId) {}

    @PostMapping("/internal/reviews/{order}")
    public Object review(@PathVariable UUID order, @RequestBody Review review) {
        if (review.actionId() == null || review.actorId() == null)
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Action/actor identity required");
        return store.review(
                order,
                review.actionId(),
                review.actorId(),
                review.action(),
                review.detail(),
                review.caseId());
    }

    @RestController
    @Profile("!prod")
    static class MockApi {
        private final PaymentFacade facade;

        MockApi(PaymentFacade facade) {
            this.facade = facade;
        }

        @PostMapping("/internal/mock/{order}/{success}")
        public void mock(@PathVariable UUID order, @PathVariable boolean success) {
            facade.mock(order, success);
        }
    }

    @RestControllerAdvice
    static class Errors {
        @ExceptionHandler(com.ticketbox.payments.application.error.PaymentRejection.class)
        ResponseEntity<?> rejected(
                com.ticketbox.payments.application.error.PaymentRejection error) {
            int status =
                    switch (error.kind()) {
                        case INVALID_REQUEST -> 400;
                        case MISSING_ATTEMPT -> 404;
                        case IDENTITY_CONFLICT -> 409;
                        case PROVIDER_CAPACITY -> 503;
                    };
            return ResponseEntity.status(status).body(Map.of("message", error.getMessage()));
        }

        @ExceptionHandler(ResponseStatusException.class)
        ResponseEntity<?> status(ResponseStatusException error) {
            return ResponseEntity.status(error.getStatusCode())
                    .body(
                            Map.of(
                                    "message",
                                    Objects.toString(error.getReason(), "Request rejected")));
        }

        @ExceptionHandler(AppException.class)
        ResponseEntity<?> gateway(AppException error) {
            return ResponseEntity.status(
                            error.getErrorCode() == ErrorCode.INVALID_REQUEST ? 400 : 503)
                    .body(Map.of("message", error.getMessage()));
        }

        @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
        ResponseEntity<?> conflict() {
            return ResponseEntity.status(409)
                    .body(Map.of("message", "Payment identity/transaction conflict"));
        }
    }
}
