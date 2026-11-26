package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;

/** What the order page needs to show about refunding one order. */
public record RefundRequestState(
        boolean canRequest,
        @JsonInclude(JsonInclude.Include.NON_NULL) String blockedReason,
        @JsonInclude(JsonInclude.Include.NON_NULL) String origin,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime deadline,
        @JsonInclude(JsonInclude.Include.NON_NULL) RefundRequestView request) {}
