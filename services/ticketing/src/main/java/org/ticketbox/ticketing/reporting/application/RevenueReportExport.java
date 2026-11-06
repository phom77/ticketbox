package org.ticketbox.ticketing.reporting.application;

public record RevenueReportExport(
        byte[] content,
        String contentType,
        String filename) {
}
