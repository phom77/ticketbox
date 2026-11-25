package org.ticketbox.ticketing.order.application.port;

import org.ticketbox.ticketing.order.domain.RefundEligibility;
import org.ticketbox.ticketing.order.domain.RefundRequest;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Storage for refund requests and the facts that decide whether an order can be refunded. */
public interface RefundRequestStore {
    record OrderRef(UUID orderId, UUID buyerId, UUID organizationId, UUID concertId) {}

    /** A request with the order and event details shown next to it. */
    record Row(RefundRequest request, String orderReference, UUID concertId, String concertTitle, BigDecimal amount,
            UUID organizationId) {}

    record Page(List<Row> content, int page, int size, long totalElements, int totalPages) {}

    Optional<OrderRef> order(UUID orderId);

    /** Takes the order's row lock, the same lock that payment, refund, transfer and expiry use. */
    Optional<OrderRef> lockOrder(UUID orderId);

    Optional<UUID> orderIdOf(UUID requestId);

    RefundEligibility.Facts facts(UUID orderId);

    Optional<RefundRequest> find(UUID requestId);

    Optional<RefundRequest> findLatestByOrder(UUID orderId);

    Optional<RefundRequest> findOpenByOrder(UUID orderId);

    Optional<RefundRequest> findByCase(UUID caseId);

    Optional<Row> row(UUID requestId);

    void insert(RefundRequest request);

    void update(RefundRequest request);

    /** A null organization lists every organization (platform administrators). */
    Page list(UUID organizationId, List<RefundRequest.Status> statuses, OffsetDateTime createdBefore, int page, int size);

    List<UUID> approvedWithoutCase(OffsetDateTime approvedBefore, int limit);
}
