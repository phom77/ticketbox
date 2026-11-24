package org.ticketbox.ticketing.issuance.infrastructure;

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

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.application.port.catalog.TicketTypeView;
import org.ticketbox.ticketing.infrastructure.document.PdfFonts;
import org.ticketbox.ticketing.issuance.application.port.ETicketDocument;
import org.ticketbox.ticketing.issuance.application.port.ETicketDocumentPort;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;
import org.ticketbox.ticketing.issuance.application.port.TicketPlaces;
import org.ticketbox.ticketing.issuance.application.port.TicketPlaces.Place;
import org.ticketbox.ticketing.issuance.domain.Ticket;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.domain.Order;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderETicketPdfService implements ETicketDocumentPort {

    private static final DateTimeFormatter DATE_TIME =
            DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
    private final OrderRepository orderRepository;
    private final TicketRepository ticketRepository;
    private final ConcertOrderPort concertOrderPort;
    private final TicketPlaces places;

    @Override
    public Optional<ETicketDocument> createForOrder(UUID orderId) {
        Order order = orderRepository.findById(orderId).orElse(null);
        if (order == null || order.getStatus() != Order.Status.PAID) return Optional.empty();
        List<Ticket> tickets = ticketRepository.findByOrderId(orderId);
        if (tickets.isEmpty()) return Optional.empty();
        ConcertView concert = concertOrderPort.findConcertById(order.getConcertId()).orElse(null);
        if (concert == null) return Optional.empty();
        Map<UUID, String> typeNames =
                concertOrderPort
                        .findTicketTypesByIds(
                                tickets.stream().map(Ticket::getTicketTypeId).distinct().toList())
                        .stream()
                        .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));
        return Optional.of(
                new ETicketDocument(
                        (order.getReferenceCode() == null ? "TicketBox" : "TicketBox-" + order.getReferenceCode()) + ".pdf",
                        "application/pdf",
                        render(concert, tickets, typeNames, places.forTickets(tickets.stream().map(Ticket::getId).toList()))));
    }

    private byte[] render(ConcertView concert, List<Ticket> tickets, Map<UUID, String> typeNames,
                          Map<UUID, Place> scheduleByTicket) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A5, 34, 34, 30, 30);
            PdfWriter.getInstance(document, output);
            document.open();
            var unicodeFont = PdfFonts.notoSans();
            Font brand = new Font(unicodeFont, 11, Font.BOLD, new Color(37, 85, 216));
            Font title = new Font(unicodeFont, 21, Font.BOLD, new Color(23, 33, 58));
            Font body = new Font(unicodeFont, 10, Font.NORMAL, new Color(71, 85, 105));
            Font strong = new Font(unicodeFont, 11, Font.BOLD, new Color(23, 33, 58));

            for (int index = 0; index < tickets.size(); index++) {
                if (index > 0) document.newPage();
                Ticket ticket = tickets.get(index);
                Place place = scheduleByTicket.get(ticket.getId());
                Paragraph logo = new Paragraph("TICKETBOX  |  OFFICIAL E-TICKET", brand);
                logo.setAlignment(Element.ALIGN_CENTER);
                document.add(logo);
                document.add(spacer(12));
                Paragraph concertTitle = new Paragraph(place == null ? concert.title() : place.title(), title);
                concertTitle.setAlignment(Element.ALIGN_CENTER);
                document.add(concertTitle);
                Paragraph schedule =
                        new Paragraph("Event: " + DATE_TIME.format(place == null ? concert.eventDate() : place.startsAt()), body);
                schedule.setAlignment(Element.ALIGN_CENTER);
                document.add(schedule);
                document.add(spacer(14));
                Image qr = Image.getInstance(qrPng(ticket.getQrCode()));
                qr.scaleAbsolute(190, 190);
                qr.setAlignment(Element.ALIGN_CENTER);
                document.add(qr);
                document.add(spacer(8));
                Paragraph type =
                        new Paragraph(
                                place == null ? typeNames.getOrDefault(ticket.getTicketTypeId(), "Ticket")
                                        : place.offerName(), strong);
                type.setAlignment(Element.ALIGN_CENTER);
                document.add(type);
                if (place != null) {
                    Paragraph venue = new Paragraph(place.venueName(), body);
                    venue.setAlignment(Element.ALIGN_CENTER);
                    document.add(venue);
                    String seat = place.seatLabel() == null ? place.sectionLabel() :
                            place.sectionLabel() + " | " + place.rowLabel() + " / " + place.seatLabel();
                    Paragraph location = new Paragraph(seat, body);
                    location.setAlignment(Element.ALIGN_CENTER);
                    document.add(location);
                }
                if (ticket.getReferenceCode() != null) {
                    Paragraph reference = new Paragraph("Ticket reference: " + ticket.getReferenceCode(), body);
                    reference.setAlignment(Element.ALIGN_CENTER);
                    document.add(reference);
                }
                Paragraph count =
                        new Paragraph("Ticket " + (index + 1) + " / " + tickets.size(), body);
                count.setAlignment(Element.ALIGN_CENTER);
                document.add(count);
                document.add(spacer(16));
                Paragraph warning =
                        new Paragraph(
                                "Keep this QR private. Present it only to TicketBox gate staff.",
                                body);
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
