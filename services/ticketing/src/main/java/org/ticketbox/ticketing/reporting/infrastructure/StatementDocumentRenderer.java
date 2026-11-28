package org.ticketbox.ticketing.reporting.infrastructure;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;

import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.infrastructure.document.PdfFonts;
import org.ticketbox.ticketing.reporting.application.port.StatementRenderer;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement.Line;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * PDF (OpenPDF, Noto Sans) and CSV of one statement. Both are built from the same tables, so they carry the same
 * figures. Statements say that no money moves through them and show net sales, never an amount payable.
 */
@Component
class StatementDocumentRenderer implements StatementRenderer {
    static final String NOT_PROVIDED = "Not provided";
    static final String FOOTER = "This statement records sales and refunds processed by TicketBox. It is not an invoice,"
            + " payout or transfer, and no money moves through it.";
    private static final List<String> FIGURES = List.of("Tickets sold", "Tickets refunded", "Gross sales (VND)",
            "Refunds (VND)", "Net sales (VND)", "Sale orders", "Refund orders");

    private record Table(String title, List<String> head, List<List<String>> rows) {}

    @Override
    public byte[] csv(SettlementStatement s) {
        StringBuilder out = new StringBuilder().append((char) 0xFEFF);
        for (Table table : tables(s)) {
            if (!table.title().isEmpty()) out.append(field(table.title())).append("\r\n");
            if (!table.head().isEmpty()) out.append(line(table.head()));
            table.rows().forEach(row -> out.append(line(row)));
            out.append("\r\n");
        }
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public byte[] pdf(SettlementStatement s, byte[] logo) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 36, 36);
            PdfWriter.getInstance(document, output);
            document.open();
            var unicode = PdfFonts.notoSans();
            Font title = new Font(unicode, 16, Font.BOLD);
            Font heading = new Font(unicode, 10, Font.BOLD);
            Font body = new Font(unicode, 8);
            if (logo != null) {
                try {
                    Image image = Image.getInstance(logo);
                    image.scaleToFit(120, 60);
                    document.add(image);
                } catch (IOException | DocumentException unreadable) {
                    // A logo that cannot be decoded is left out; the statement is still valid.
                }
            }
            document.add(new Paragraph("Settlement statement " + s.number(), title));
            document.add(new Paragraph("Platform fee: 0 VND", heading));
            for (Table table : tables(s)) {
                if (!table.title().isEmpty()) {
                    Paragraph caption = new Paragraph(table.title(), heading);
                    caption.setSpacingBefore(10);
                    document.add(caption);
                }
                int columns = Math.max(table.head().size(), table.rows().stream().mapToInt(List::size).max().orElse(1));
                PdfPTable grid = new PdfPTable(columns);
                grid.setWidthPercentage(100);
                table.head().forEach(cell -> grid.addCell(cell(cell, heading, Element.ALIGN_CENTER)));
                table.rows().forEach(row -> {
                    row.forEach(cell -> grid.addCell(cell(cell, body, Element.ALIGN_LEFT)));
                    for (int i = row.size(); i < columns; i++) grid.addCell(cell("", body, Element.ALIGN_LEFT));
                });
                document.add(grid);
            }
            Paragraph footer = new Paragraph(FOOTER, body);
            footer.setSpacingBefore(14);
            document.add(footer);
            document.add(new Paragraph("This statement is valid as of its cutoff. A later revision may supersede it;"
                    + " check TicketBox for the current revision.", body));
            document.close();
            return output.toByteArray();
        } catch (DocumentException | IOException failure) {
            throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, "error.revenue.pdf-failed");
        }
    }

    private static final java.time.format.DateTimeFormatter STAMP =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss XXX", java.util.Locale.ROOT);

    /** Times print in the statement's own timezone, with the offset, never as UTC instants. */
    static String local(java.time.OffsetDateTime at, String timezone) {
        return STAMP.format(at.atZoneSameInstant(java.time.ZoneId.of(timezone)));
    }

    private static List<Table> tables(SettlementStatement s) {
        var org = s.organization();
        var scope = s.scope();
        var t = s.totals();
        List<Table> tables = new ArrayList<>();
        String legal = org.legalName() == null ? org.displayName() : org.legalName();
        List<List<String>> header = new ArrayList<>();
        header.add(List.of("Statement number", s.number()));
        header.add(List.of("Revision", Integer.toString(s.revision())));
        if (s.supersedesNumber() != null) header.add(List.of("Supersedes", s.supersedesNumber()));
        if (s.supersededByNumber() != null) header.add(List.of("Superseded by", s.supersededByNumber()));
        header.add(List.of("Platform fee", "0 VND"));
        header.add(List.of("Organization", legal));
        header.add(List.of("Display name", org.displayName()));
        header.add(List.of("Tax code", text(org.taxCode())));
        header.add(List.of("Billing address", text(org.billingAddress())));
        header.add(List.of("Contact", text(String.join(" ", java.util.stream.Stream.of(org.contactEmail(),
                org.contactPhone()).filter(Objects::nonNull).toList()))));
        header.add(List.of("Scope", s.scopeType().equals("EVENT") ? "Event" : "Performance"));
        header.add(List.of("Name", Objects.toString(scope.title(), "")));
        header.add(List.of("Venue", Objects.toString(scope.venueName(), "")));
        header.add(List.of("Performances", Integer.toString(scope.performanceCount())));
        header.add(List.of("Timezone", s.timezone()));
        header.add(List.of("Cutoff", local(s.cutoffAt(), s.timezone())));
        header.add(List.of("Issued", local(s.issuedAt(), s.timezone())));
        tables.add(new Table("Statement", List.of(), header));
        tables.add(new Table("Totals", List.of("Item", "Value"), List.of(
                List.of("Gross sales (VND)", Long.toString(t.grossSales())),
                List.of("Refunds (VND)", Long.toString(t.refunds())),
                List.of("Net sales (VND)", Long.toString(t.netSales())),
                List.of("Sale orders", Integer.toString(t.saleOrders())),
                List.of("Refund orders", Integer.toString(t.refundOrders())),
                List.of("Tickets sold", Integer.toString(t.ticketsSold())),
                List.of("Tickets refunded", Integer.toString(t.ticketsRefunded())),
                List.of("Verified collected (VND)", Long.toString(t.verifiedCollected())),
                List.of("Verified refunded (VND)", Long.toString(t.verifiedRefunded())),
                List.of("Orders not yet reconciled", Integer.toString(t.unreconciledOrders())))));
        for (String kind : List.of("PERFORMANCE", "OFFER")) {
            var rows = s.lines().stream().filter(l -> l.kind().equals(kind)).map(StatementDocumentRenderer::row).toList();
            if (rows.isEmpty()) continue;
            List<String> head = new ArrayList<>(List.of(kind.equals("OFFER") ? "Ticket type" : "Performance"));
            head.addAll(FIGURES);
            tables.add(new Table(kind.equals("OFFER") ? "By ticket type" : "By performance", head, rows));
        }
        var providers = s.lines().stream().filter(l -> l.kind().equals("PROVIDER")).toList();
        if (!providers.isEmpty()) {
            List<String> head = new ArrayList<>(List.of("Provider"));
            head.addAll(FIGURES);
            head.add("Verified collected (VND)");
            head.add("Verified refunded (VND)");
            tables.add(new Table("By payment provider", head, providers.stream().map(l -> {
                List<String> row = new ArrayList<>(row(l));
                row.add(Long.toString(l.verifiedCollected()));
                row.add(Long.toString(l.verifiedRefunded()));
                return row;
            }).toList()));
        }
        return tables;
    }

    private static List<String> row(Line l) {
        return List.of(l.label(), Integer.toString(l.ticketsSold()), Integer.toString(l.ticketsRefunded()),
                Long.toString(l.grossSales()), Long.toString(l.refunds()), Long.toString(l.netSales()),
                Integer.toString(l.saleOrders()), Integer.toString(l.refundOrders()));
    }

    private static String text(String value) {
        return value == null || value.isBlank() ? NOT_PROVIDED : value;
    }

    private static String line(List<String> cells) {
        return cells.stream().map(StatementDocumentRenderer::field).collect(Collectors.joining(",", "", "\r\n"));
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

    private static PdfPCell cell(String value, Font font, int alignment) {
        PdfPCell cell = new PdfPCell(new Phrase(value, font));
        cell.setHorizontalAlignment(alignment);
        cell.setPadding(3);
        return cell;
    }
}
