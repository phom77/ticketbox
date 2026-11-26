package org.ticketbox.ticketing.reporting.application.port;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Append-only sales ledger (ADR 0005). Writes join the caller's transaction and are idempotent per order item and
 * kind, so a replayed payment or refund result changes nothing.
 */
public interface SalesLedger {
    /** Records one SALE row per item of an order that has just become PAID. */
    void recordSale(UUID orderId, String provider, OffsetDateTime paidAt);

    /** Records one REFUND row per item of a paid order whose refund was confirmed at the given time. */
    void recordRefund(UUID orderId, String provider, OffsetDateTime confirmedAt);
}
