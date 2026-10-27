package com.ticketbox.module.ticket.application;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.PdfWriter;
import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.module.concert.TicketTypeView;
import com.ticketbox.module.ticket.ETicketDocument;
import com.ticketbox.module.ticket.ETicketDocumentPort;
import com.ticketbox.module.ticket.domain.Order;
import com.ticketbox.module.ticket.domain.OrderRepository;
import com.ticketbox.module.ticket.domain.Ticket;
import com.ticketbox.module.ticket.domain.TicketRepository;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderETicketPdfService implements ETicketDocumentPort {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
    private final OrderRepository orderRepository;
    private final TicketRepository ticketRepository;
    private final ConcertOrderPort concertOrderPort;

    @Override
    public Optional<ETicketDocument> createForOrder(UUID orderId) {
        Order order = orderRepository.findById(orderId).orElse(null);
        if (order == null || order.getStatus() != Order.Status.PAID) return Optional.empty();
        List<Ticket> tickets = ticketRepository.findByOrderId(orderId);
        if (tickets.isEmpty()) return Optional.empty();
        ConcertView concert = concertOrderPort.findConcertById(order.getConcertId()).orElse(null);
        if (concert == null) return Optional.empty();
        Map<UUID, String> typeNames = concertOrderPort.findTicketTypesByIds(
                        tickets.stream().map(Ticket::getTicketTypeId).distinct().toList()).stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));
        return Optional.of(new ETicketDocument(
                "TicketBox-" + orderId.toString().substring(0, 8).toUpperCase() + ".pdf",
                "application/pdf",
                render(concert, tickets, typeNames)));
    }

    private byte[] render(ConcertView concert, List<Ticket> tickets, Map<UUID, String> typeNames) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A5, 34, 34, 30, 30);
            PdfWriter.getInstance(document, output);
            document.open();
            Font brand = new Font(Font.HELVETICA, 11, Font.BOLD, new Color(37, 85, 216));
            Font title = new Font(Font.HELVETICA, 21, Font.BOLD, new Color(23, 33, 58));
            Font body = new Font(Font.HELVETICA, 10, Font.NORMAL, new Color(71, 85, 105));
            Font strong = new Font(Font.HELVETICA, 11, Font.BOLD, new Color(23, 33, 58));

            for (int index = 0; index < tickets.size(); index++) {
                if (index > 0) document.newPage();
                Ticket ticket = tickets.get(index);
                Paragraph logo = new Paragraph("TICKETBOX  |  OFFICIAL E-TICKET", brand);
                logo.setAlignment(Element.ALIGN_CENTER);
                document.add(logo);
                document.add(spacer(12));
                Paragraph concertTitle = new Paragraph(concert.title(), title);
                concertTitle.setAlignment(Element.ALIGN_CENTER);
                document.add(concertTitle);
                Paragraph schedule = new Paragraph("Event: " + DATE_TIME.format(concert.eventDate()), body);
                schedule.setAlignment(Element.ALIGN_CENTER);
                document.add(schedule);
                document.add(spacer(14));
                Image qr = Image.getInstance(qrPng(ticket.getQrCode()));
                qr.scaleAbsolute(190, 190);
                qr.setAlignment(Element.ALIGN_CENTER);
                document.add(qr);
                document.add(spacer(8));
                Paragraph type = new Paragraph(typeNames.getOrDefault(ticket.getTicketTypeId(), "Ticket"), strong);
                type.setAlignment(Element.ALIGN_CENTER);
                document.add(type);
                Paragraph id = new Paragraph("Ticket ID: " + ticket.getId(), body);
                id.setAlignment(Element.ALIGN_CENTER);
                document.add(id);
                Paragraph count = new Paragraph("Ticket " + (index + 1) + " / " + tickets.size(), body);
                count.setAlignment(Element.ALIGN_CENTER);
                document.add(count);
                document.add(spacer(16));
                Paragraph warning = new Paragraph("Keep this QR private. Present it only to TicketBox gate staff.", body);
                warning.setAlignment(Element.ALIGN_CENTER);
                document.add(warning);
            }
            document.close();
            return output.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not generate e-ticket PDF", exception);
        }
    }

    private byte[] qrPng(String value) throws Exception {
        BitMatrix matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 420, 420);
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return output.toByteArray();
        }
    }

    private Paragraph spacer(float leading) {
        Paragraph paragraph = new Paragraph(" ");
        paragraph.setLeading(leading);
        return paragraph;
    }
}
