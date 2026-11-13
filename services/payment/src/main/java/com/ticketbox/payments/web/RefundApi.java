package com.ticketbox.payments.web;

import com.ticketbox.payments.application.port.RefundCases;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
class RefundApi {
    private final RefundCases refunds;

    RefundApi(RefundCases refunds) {
        this.refunds = refunds;
    }

    @PostMapping("/internal/refunds/{order}")
    RefundCases.Case apply(@PathVariable UUID order, @RequestBody RefundCases.Command command) {
        return refunds.apply(order, command);
    }
}
