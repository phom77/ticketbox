package org.ticketbox.ticketing.reporting.domain;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * An issued settlement statement (ADR 0007): figures plus the details captured when it was issued. {@code outOfDate}
 * means the scope's sales, refunds or verified provider records changed since issue; {@code detailsChanged} means the
 * organization's statement details differ from the captured ones. Both are computed on read.
 */
public record SettlementStatement(UUID id, UUID organizationId, String scopeType, UUID scopeId, UUID eventId,
                                  String number, int revision, UUID supersedesId, String supersedesNumber,
                                  String supersededByNumber, String status, String timezone, OffsetDateTime cutoffAt,
                                  OffsetDateTime issuedAt, UUID issuedBy, OrganizationDetails organization,
                                  ScopeDetails scope, Totals totals, List<Line> lines, boolean outOfDate,
                                  boolean detailsChanged) {
    public static final String PERFORMANCE = "PERFORMANCE";
    public static final String EVENT = "EVENT";
    public static final String CURRENT = "CURRENT";
    public static final String SUPERSEDED = "SUPERSEDED";

    /** Details of the organization as they were when the statement was issued. */
    public record OrganizationDetails(String displayName, String legalName, String taxCode, String billingAddress,
                                      String contactEmail, String contactPhone, String website,
                                      boolean logoIncluded) {}

    public record ScopeDetails(String title, String eventTitle, String venueName, OffsetDateTime startsAt,
                               OffsetDateTime endsAt, int performanceCount) {}

    public record Totals(long grossSales, long refunds, long netSales, int saleOrders, int refundOrders,
                         int ticketsSold, int ticketsRefunded, long verifiedCollected, long verifiedRefunded,
                         int unreconciledOrders) {}

    /** kind is PERFORMANCE, OFFER or PROVIDER. Verified amounts are only filled on PROVIDER lines. */
    public record Line(String kind, int sort, String label, UUID key, String provider, int ticketsSold,
                       int ticketsRefunded, long grossSales, long refunds, long netSales, long verifiedCollected,
                       long verifiedRefunded, int saleOrders, int refundOrders) {
        public Line withProvider(String name) {
            return new Line(kind, sort, label, key, name, ticketsSold, ticketsRefunded, grossSales, refunds, netSales,
                    verifiedCollected, verifiedRefunded, saleOrders, refundOrders);
        }
    }

    public SettlementStatement withLines(List<Line> next) {
        return new SettlementStatement(id, organizationId, scopeType, scopeId, eventId, number, revision, supersedesId,
                supersedesNumber, supersededByNumber, status, timezone, cutoffAt, issuedAt, issuedBy, organization,
                scope, totals, next, outOfDate, detailsChanged);
    }

    public SettlementStatement withOutOfDate(boolean flag) {
        return new SettlementStatement(id, organizationId, scopeType, scopeId, eventId, number, revision, supersedesId,
                supersedesNumber, supersededByNumber, status, timezone, cutoffAt, issuedAt, issuedBy, organization,
                scope, totals, lines, flag, detailsChanged);
    }

    public SettlementStatement withFlags(boolean outOfDate, boolean detailsChanged) {
        return new SettlementStatement(id, organizationId, scopeType, scopeId, eventId, number, revision, supersedesId,
                supersedesNumber, supersededByNumber, status, timezone, cutoffAt, issuedAt, issuedBy, organization,
                scope, totals, lines, outOfDate, detailsChanged);
    }
}
