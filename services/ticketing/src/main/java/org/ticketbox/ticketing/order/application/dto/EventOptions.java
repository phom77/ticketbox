package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** What a buyer can do about a postponed or cancelled event, order by order. */
public record EventOptions(DisruptionNotice disruption, List<OptionsOrder> orders) {
    /**
     * {@code refundStage} describes a cancelled event's automatic refund: PENDING, APPROVED or REFUNDED. For a
     * postponed event, {@code canRequest} and {@code request} describe the buyer's own refund request.
     */
    public record OptionsOrder(
            UUID orderId,
            @JsonInclude(JsonInclude.Include.NON_NULL) String referenceCode,
            BigDecimal amount,
            String status,
            String refundStage,
            boolean canRequest,
            @JsonInclude(JsonInclude.Include.NON_NULL) String blockedReason,
            @JsonInclude(JsonInclude.Include.NON_NULL) RefundRequestView request) {}
}
