package com.ticketbox.module.admin.application;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.ticketbox.module.admin.web.dto.RevenueSummaryResponse;
import com.ticketbox.module.admin.web.dto.ZoneRevenueResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class RevenueReportExportService {

    private static final String CSV_CONTENT_TYPE = "text/csv;charset=UTF-8";
    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String PDF_FONT_PATH = "fonts/NotoSans-Regular.ttf";
    private static final ZoneId REPORTING_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter EXPORTED_AT_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss XXX");

    private final OrganizerRevenueService organizerRevenueService;

    public RevenueReportExportService(OrganizerRevenueService organizerRevenueService) {
        this.organizerRevenueService = organizerRevenueService;
    }

    public RevenueReportExport export(UUID concertId, UUID organizerId, String format) {
        String concertName =
                organizerRevenueService.getCompletedConcertName(concertId, organizerId);
        RevenueSummaryResponse summary =
                organizerRevenueService.getRevenueSummary(concertId, organizerId);
        List<ZoneRevenueResponse> zones =
                organizerRevenueService.getZoneRevenue(concertId, organizerId);
        String filenamePrefix = filenameValue(concertName);

        return switch (normalizeFormat(format)) {
            case "csv" -> new RevenueReportExport(
                    createCsv(concertName, summary, zones),
                    CSV_CONTENT_TYPE,
                    filenamePrefix + "-revenue-report.csv");
            case "pdf" -> new RevenueReportExport(
                    createPdf(concertName, summary, zones),
                    PDF_CONTENT_TYPE,
                    filenamePrefix + "-revenue-report.pdf");
            default -> throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Định dạng xuất báo cáo không được hỗ trợ. Định dạng hỗ trợ: csv, pdf");
        };
    }

    private byte[] createCsv(
            String concertName,
            RevenueSummaryResponse summary,
            List<ZoneRevenueResponse> zones) {
        StringBuilder csv = new StringBuilder();
        csv.append('\uFEFF');
        csv.append("Concert Name,Total Revenue,Total Tickets Sold,Total Ticket Capacity,Sold Rate (%)\r\n");
        csv.append(csvValue(concertName)).append(',')
                .append(decimalValue(summary.totalRevenue())).append(',')
                .append(summary.totalTicketsSold()).append(',')
                .append(summary.totalTicketsAvailable()).append(',')
                .append(decimalValue(summary.soldRate())).append("\r\n\r\n");

        csv.append("Zone,Price,Sold Quantity,Available Quantity,Total Quantity,Revenue,Sold Rate (%)\r\n");
        for (ZoneRevenueResponse zone : zones) {
            csv.append(csvValue(zone.zoneName())).append(',')
                    .append(decimalValue(zone.price())).append(',')
                    .append(zone.soldQuantity()).append(',')
                    .append(zone.availableQuantity()).append(',')
                    .append(zone.totalQuantity()).append(',')
                    .append(decimalValue(zone.revenue())).append(',')
                    .append(decimalValue(zone.soldRate())).append("\r\n");
        }

        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    private byte[] createPdf(
            String concertName,
            RevenueSummaryResponse summary,
            List<ZoneRevenueResponse> zones) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4.rotate(), 32, 32, 32, 32);
            PdfWriter.getInstance(document, output);
            document.open();

            BaseFont unicodeFont = BaseFont.createFont(
                    PDF_FONT_PATH,
                    BaseFont.IDENTITY_H,
                    BaseFont.EMBEDDED);
            Font titleFont = new Font(unicodeFont, 18, Font.BOLD);
            Font headingFont = new Font(unicodeFont, 10, Font.BOLD);
            Font bodyFont = new Font(unicodeFont, 9);

            Paragraph title = new Paragraph("TicketBox Revenue Report", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            document.add(title);
            document.add(new Paragraph("Concert Name: " + concertName, bodyFont));
            document.add(new Paragraph(
                    "Exported at: " + OffsetDateTime.now(REPORTING_ZONE)
                            .format(EXPORTED_AT_FORMAT),
                    bodyFont));
            document.add(new Paragraph(" "));

            PdfPTable summaryTable = new PdfPTable(4);
            summaryTable.setWidthPercentage(100);
            addHeaderCell(summaryTable, "Total Revenue", headingFont);
            addHeaderCell(summaryTable, "Tickets Sold", headingFont);
            addHeaderCell(summaryTable, "Ticket Capacity", headingFont);
            addHeaderCell(summaryTable, "Sold Rate (%)", headingFont);
            addBodyCell(summaryTable, decimalValue(summary.totalRevenue()), bodyFont);
            addBodyCell(summaryTable, Long.toString(summary.totalTicketsSold()), bodyFont);
            addBodyCell(summaryTable, Long.toString(summary.totalTicketsAvailable()), bodyFont);
            addBodyCell(summaryTable, decimalValue(summary.soldRate()), bodyFont);
            document.add(summaryTable);
            document.add(new Paragraph(" "));

            PdfPTable zoneTable = new PdfPTable(7);
            zoneTable.setWidthPercentage(100);
            zoneTable.setWidths(new float[] {2.2f, 1.4f, 1.2f, 1.4f, 1.2f, 1.6f, 1.2f});
            addHeaderCell(zoneTable, "Zone", headingFont);
            addHeaderCell(zoneTable, "Price", headingFont);
            addHeaderCell(zoneTable, "Sold", headingFont);
            addHeaderCell(zoneTable, "Available", headingFont);
            addHeaderCell(zoneTable, "Total", headingFont);
            addHeaderCell(zoneTable, "Revenue", headingFont);
            addHeaderCell(zoneTable, "Sold Rate (%)", headingFont);

            for (ZoneRevenueResponse zone : zones) {
                addBodyCell(zoneTable, zone.zoneName(), bodyFont);
                addBodyCell(zoneTable, decimalValue(zone.price()), bodyFont);
                addBodyCell(zoneTable, Long.toString(zone.soldQuantity()), bodyFont);
                addBodyCell(zoneTable, Long.toString(zone.availableQuantity()), bodyFont);
                addBodyCell(zoneTable, Long.toString(zone.totalQuantity()), bodyFont);
                addBodyCell(zoneTable, decimalValue(zone.revenue()), bodyFont);
                addBodyCell(zoneTable, decimalValue(zone.soldRate()), bodyFont);
            }

            document.add(zoneTable);
            document.close();
            return output.toByteArray();
        } catch (DocumentException | java.io.IOException exception) {
            throw new AppException(
                    ErrorCode.INTERNAL_SERVER_ERROR,
                    "Không thể tạo báo cáo doanh thu PDF");
        }
    }

    private void addHeaderCell(PdfPTable table, String value, Font font) {
        PdfPCell cell = new PdfPCell(new Phrase(value, font));
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        cell.setPadding(6);
        table.addCell(cell);
    }

    private void addBodyCell(PdfPTable table, String value, Font font) {
        PdfPCell cell = new PdfPCell(new Phrase(value, font));
        cell.setPadding(5);
        table.addCell(cell);
    }

    private String normalizeFormat(String format) {
        return format == null ? "" : format.trim().toLowerCase(Locale.ROOT);
    }

    private String decimalValue(BigDecimal value) {
        return value == null ? "0" : value.toPlainString();
    }

    private String csvValue(String value) {
        if (value == null) {
            return "";
        }
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private String filenameValue(String concertName) {
        String normalized = Normalizer.normalize(concertName, Normalizer.Form.NFC)
                .trim()
                .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-{2,}", "-");
        return normalized.isBlank() ? "concert" : normalized;
    }
}
