package org.ticketbox.ticketing.reporting.application.port;

import org.ticketbox.ticketing.reporting.application.RevenueReportExport;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Report;

public interface SalesReportExporter {
    /** Renders {@code report} as "csv" or "pdf". */
    RevenueReportExport export(Report report, String format);
}
