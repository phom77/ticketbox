package org.ticketbox.ticketing.reporting.application.port;

import org.ticketbox.ticketing.reporting.application.RevenueReportExport;

import java.util.UUID;

public interface RevenueReportExporter {
    RevenueReportExport export(UUID concertId, UUID organizerId, String format);
}
