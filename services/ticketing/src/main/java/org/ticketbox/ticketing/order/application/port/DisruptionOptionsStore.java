package org.ticketbox.ticketing.order.application.port;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Read-only view of postponements and cancellations that affect a buyer's paid orders. */
public interface DisruptionOptionsStore {
    /** {@code kind} is CANCEL or POSTPONE; {@code newEventDate} is the new date of a postponed event. */
    record Disruption(UUID concertId, String concertTitle, String kind, OffsetDateTime newEventDate) {}

    /** {@code refundState} is the local refund preparation state (PREPARED, CONFIRMED, ABORTED), if any. */
    record OrderRow(UUID orderId, String referenceCode, BigDecimal amount, String status, String refundState) {}

    List<Disruption> forBuyer(UUID buyerId);

    Optional<Disruption> find(UUID buyerId, UUID concertId);

    List<OrderRow> orders(UUID buyerId, UUID concertId);
}
