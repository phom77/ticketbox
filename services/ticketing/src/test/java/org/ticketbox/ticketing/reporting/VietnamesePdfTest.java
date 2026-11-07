package org.ticketbox.ticketing.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.application.port.catalog.TicketTypeView;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;
import org.ticketbox.ticketing.issuance.domain.Ticket;
import org.ticketbox.ticketing.issuance.infrastructure.OrderETicketPdfService;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.reporting.application.OrganizerRevenueService;
import org.ticketbox.ticketing.reporting.application.dto.RevenueSummaryResponse;
import org.ticketbox.ticketing.reporting.application.dto.ZoneRevenueResponse;
import org.ticketbox.ticketing.reporting.infrastructure.RevenueReportExportService;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

class VietnamesePdfTest {
    private static final String TITLE = "Đêm nhạc Ánh Dương";
    private static final String ZONE = "Hạng phổ thông";

    @Test
    void paidTicketPdfEmbedsVietnameseConcertAndZone() throws Exception {
        var orders = mock(OrderRepository.class);
        var tickets = mock(TicketRepository.class);
        var concerts = mock(ConcertOrderPort.class);
        UUID orderId = UUID.randomUUID(), concertId = UUID.randomUUID(), typeId = UUID.randomUUID();
        var order = new Order();
        order.setStatus(Order.Status.PAID);
        order.setConcertId(concertId);
        var ticket = new Ticket();
        ticket.setId(UUID.randomUUID());
        ticket.setTicketTypeId(typeId);
        ticket.setQrCode("qr-fixture");
        when(orders.findById(orderId)).thenReturn(Optional.of(order));
        when(tickets.findByOrderId(orderId)).thenReturn(List.of(ticket));
        when(concerts.findConcertById(concertId))
                .thenReturn(
                        Optional.of(
                                new ConcertView(
                                        concertId,
                                        TITLE,
                                        "ON_SALE",
                                        OffsetDateTime.now(),
                                        null,
                                        null)));
        when(concerts.findTicketTypesByIds(List.of(typeId)))
                .thenReturn(
                        List.of(
                                new TicketTypeView(
                                        typeId, concertId, ZONE, BigDecimal.TEN, 4, 3, 2, true)));

        var document =
                new OrderETicketPdfService(orders, tickets, concerts)
                        .createForOrder(orderId)
                        .orElseThrow();
        verifyPdf(document.content());
    }

    @Test
    void revenuePdfEmbedsVietnameseConcertAndZone() throws Exception {
        var revenues = mock(OrganizerRevenueService.class);
        UUID concert = UUID.randomUUID(), organizer = UUID.randomUUID();
        when(revenues.getCompletedConcertName(concert, organizer)).thenReturn(TITLE);
        when(revenues.getRevenueSummary(concert, organizer))
                .thenReturn(
                        new RevenueSummaryResponse(
                                concert, BigDecimal.TEN, 1, 4, BigDecimal.valueOf(25)));
        when(revenues.getZoneRevenue(concert, organizer))
                .thenReturn(
                        List.of(
                                new ZoneRevenueResponse(
                                        ZONE,
                                        BigDecimal.TEN,
                                        1,
                                        3,
                                        4,
                                        BigDecimal.TEN,
                                        BigDecimal.valueOf(25))));

        verifyPdf(
                new RevenueReportExportService(revenues)
                        .export(concert, organizer, "pdf")
                        .content());
    }

    private void verifyPdf(byte[] content) throws Exception {
        try (var pdf = Loader.loadPDF(content)) {
            assertThat(new PDFTextStripper().getText(pdf)).contains(TITLE, ZONE);
            var page = pdf.getPage(0);
            boolean embeddedNoto = false;
            for (var resource : page.getResources().getFontNames()) {
                var font = page.getResources().getFont(resource);
                embeddedNoto |= font.isEmbedded() && font.getName().contains("NotoSans");
            }
            assertThat(embeddedNoto).isTrue();
        }
    }
}
