package org.ticketbox.ticketing.reporting.infrastructure;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;

import org.springframework.stereotype.Service;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.infrastructure.document.PdfFonts;
import org.ticketbox.ticketing.reporting.application.RevenueReportExport;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Breakdown;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.BreakdownRow;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Report;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.TrendBucket;
import org.ticketbox.ticketing.reporting.application.port.SalesReportExporter;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;

/** CSV (UTF-8 with BOM, CRLF) and PDF (OpenPDF, Noto Sans) exports of the same figures the screen shows. */
@Service
public class SalesReportExportService implements SalesReportExporter {
    private static final List<String> FIGURE_HEAD = List.of("Tickets sold", "Tickets refunded", "Net tickets",
            "Orders", "Gross sales (VND)", "Refunds (VND)", "Net sales (VND)");

    @Override
    public RevenueReportExport export(Report report, String format) {
        String kind = format == null ? "" : format.trim().toLowerCase(Locale.ROOT);
        String name = filename(report);
        return switch (kind) {
            case "csv" -> new RevenueReportExport(csv(report), "text/csv;charset=UTF-8", name + ".csv");
            case "pdf" -> new RevenueReportExport(pdf(report), "application/pdf", name + ".pdf");
            default -> throw new AppException(ErrorCode.INVALID_REQUEST, "error.revenue.unsupported-format");
        };
    }

    /** A titled table: the shape both formats are rendered from. */
    private record Table(String title, List<String> head, List<List<String>> rows) {}

    private static List<Table> tables(Report report) {
        var s = report.summary();
        List<Table> tables = new ArrayList<>();
        tables.add(new Table("Report", List.of("Scope", "Name", "From", "To", "Timezone", "Provisional"),
                List.of(List.of(s.scope().type(), Objects.toString(s.scope().name(), "All events"),
                        s.from().toString(), s.to().toString(), s.timezone(), s.provisional() ? "yes" : "no"))));
        List<String> head = new ArrayList<>(FIGURE_HEAD);
        head.add("Capacity");
        head.add("Sell-through (%)");
        tables.add(new Table("Summary", head, List.of(List.of(Long.toString(s.ticketsSold()),
                Long.toString(s.ticketsRefunded()), Long.toString(s.netTickets()), Long.toString(s.orders()),
                Long.toString(s.grossSales()), Long.toString(s.refunds()), Long.toString(s.netSales()),
                Objects.toString(s.capacity(), ""), Objects.toString(s.sellThrough(), "")))));
        var buckets = report.trend().buckets();
        List<String> trendHead = new ArrayList<>(List.of("Period start (" + report.trend().groupBy() + ")"));
        trendHead.addAll(FIGURE_HEAD);
        tables.add(new Table("Trend", trendHead, buckets.stream().map(SalesReportExportService::trendRow).toList()));
        tables.add(breakdown("Performances", report.performances(), "Performance"));
        if (report.offers() != null) {
            tables.add(breakdown("Ticket types", report.offers(), "Ticket type"));
        }
        return tables;
    }

    private static List<String> trendRow(TrendBucket b) {
        return List.of(b.start().toString(), Long.toString(b.ticketsSold()), Long.toString(b.ticketsRefunded()),
                Long.toString(b.netTickets()), Long.toString(b.orders()), Long.toString(b.grossSales()),
                Long.toString(b.refunds()), Long.toString(b.netSales()));
    }

    private static Table breakdown(String title, Breakdown breakdown, String label) {
        List<String> head = new ArrayList<>(List.of(label, "Detail", "Performance", "Starts at"));
        head.addAll(FIGURE_HEAD);
        return new Table(title, head, breakdown.rows().stream().map(SalesReportExportService::row).toList());
    }

    private static List<String> row(BreakdownRow r) {
        return List.of(Objects.toString(r.label(), ""), Objects.toString(r.detail(), ""),
                Objects.toString(r.performanceTitle(), ""), Objects.toString(r.startsAt(), ""),
                Long.toString(r.ticketsSold()), Long.toString(r.ticketsRefunded()), Long.toString(r.netTickets()),
                Long.toString(r.orders()), Long.toString(r.grossSales()), Long.toString(r.refunds()),
                Long.toString(r.netSales()));
    }

    private static byte[] csv(Report report) {
        StringBuilder out = new StringBuilder().append((char) 0xFEFF);
        for (Table table : tables(report)) {
            out.append(field(table.title())).append("\r\n");
            out.append(line(table.head()));
            table.rows().forEach(row -> out.append(line(row)));
            out.append("\r\n");
        }
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static String line(List<String> cells) {
        return cells.stream().map(SalesReportExportService::field).collect(Collectors.joining(",", "", "\r\n"));
    }

    /** Quotes every cell and neutralises spreadsheet formulas in text (numbers pass through). */
    private static String field(String value) {
        String text = Objects.toString(value, "");
        String trimmed = text.stripLeading();
        boolean number = text.matches("-?\\d+(\\.\\d+)?");
        if (!number && (!trimmed.isEmpty() && "=+-@".indexOf(trimmed.charAt(0)) >= 0
                || text.startsWith("\t") || text.startsWith("\r") || text.startsWith("\n"))) {
            text = "'" + text;
        }
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }

    private static byte[] pdf(Report report) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4.rotate(), 28, 28, 28, 28);
            PdfWriter.getInstance(document, output);
            document.open();
            var unicode = PdfFonts.notoSans();
            Font title = new Font(unicode, 16, Font.BOLD);
            Font heading = new Font(unicode, 10, Font.BOLD);
            Font body = new Font(unicode, 8);
            document.add(new Paragraph("TicketBox sales report", title));
            for (Table table : tables(report)) {
                Paragraph caption = new Paragraph(table.title(), heading);
                caption.setSpacingBefore(10);
                document.add(caption);
                PdfPTable grid = new PdfPTable(table.head().size());
                grid.setWidthPercentage(100);
                table.head().forEach(cell -> grid.addCell(cell(cell, heading, Element.ALIGN_CENTER)));
                table.rows().forEach(row -> row.forEach(cell -> grid.addCell(cell(cell, body, Element.ALIGN_LEFT))));
                document.add(grid);
            }
            document.close();
            return output.toByteArray();
        } catch (DocumentException | java.io.IOException failure) {
            throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, "error.revenue.pdf-failed");
        }
    }

    private static PdfPCell cell(String value, Font font, int alignment) {
        PdfPCell cell = new PdfPCell(new Phrase(value, font));
        cell.setHorizontalAlignment(alignment);
        cell.setPadding(4);
        return cell;
    }

    private static String filename(Report report) {
        var s = report.summary();
        String scope = "ORGANIZATION".equals(s.scope().type()) ? "all-events"
                : Objects.toString(s.scope().name(), s.scope().type().toLowerCase(Locale.ROOT));
        String clean = Normalizer.normalize(scope, Normalizer.Form.NFC).trim()
                .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").replaceAll("\\s+", "-").replaceAll("-{2,}", "-");
        if (clean.isBlank()) {
            clean = "sales";
        }
        return clean + "-sales-" + s.from() + "-to-" + s.to();
    }
}
