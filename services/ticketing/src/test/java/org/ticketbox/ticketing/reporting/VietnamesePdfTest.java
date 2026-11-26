package org.ticketbox.ticketing.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.application.port.catalog.ConcertView;
import org.ticketbox.ticketing.application.port.catalog.TicketTypeView;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;
import org.ticketbox.ticketing.issuance.application.port.TicketPlaces;
import org.ticketbox.ticketing.issuance.domain.Ticket;
import org.ticketbox.ticketing.issuance.infrastructure.OrderETicketPdfService;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.reporting.application.OrganizerRevenueService;
import org.ticketbox.ticketing.reporting.application.dto.RevenueSummaryResponse;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses;
import org.ticketbox.ticketing.reporting.application.dto.ZoneRevenueResponse;
import org.ticketbox.ticketing.reporting.infrastructure.RevenueReportExportService;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
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
        var places = mock(TicketPlaces.class);
        UUID orderId = UUID.randomUUID(), concertId = UUID.randomUUID(), typeId = UUID.randomUUID();
        var order = new Order();
        order.setStatus(Order.Status.PAID);
        order.setConcertId(concertId);
        ReflectionTestUtils.setField(order, "referenceCode", "DH-10000000");
        var ticket = new Ticket();
        ticket.setId(UUID.randomUUID());
        ticket.setTicketTypeId(typeId);
        ticket.setQrCode("qr-fixture");
        ReflectionTestUtils.setField(ticket, "referenceCode", "VE-10000000");
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
                new OrderETicketPdfService(orders, tickets, concerts, places)
                        .createForOrder(orderId)
                        .orElseThrow();
        verifyPdf(document.content());
        assertThat(document.filename()).isEqualTo("TicketBox-DH-10000000.pdf");
        try (var pdf = Loader.loadPDF(document.content())) {
            assertThat(new PDFTextStripper().getText(pdf))
                    .contains("VE-10000000").doesNotContain(ticket.getId().toString());
        }
    }

    @Test
    void numberedTicketPdfUsesPurchasedSeatAndVenue() throws Exception {
        var orders = mock(OrderRepository.class);
        var tickets = mock(TicketRepository.class);
        var concerts = mock(ConcertOrderPort.class);
        var places = mock(TicketPlaces.class);
        UUID orderId = UUID.randomUUID(), performanceId = UUID.randomUUID(), ticketId = UUID.randomUUID();
        var order = new Order();
        order.setStatus(Order.Status.PAID);
        order.setConcertId(performanceId);
        var ticket = new Ticket();
        ticket.setId(ticketId);
        ticket.setTicketTypeId(UUID.randomUUID());
        ticket.setQrCode("qr-fixture");
        when(orders.findById(orderId)).thenReturn(Optional.of(order));
        when(tickets.findByOrderId(orderId)).thenReturn(List.of(ticket));
        when(concerts.findConcertById(performanceId)).thenReturn(Optional.of(
                new ConcertView(performanceId, TITLE, "ON_SALE", OffsetDateTime.now(), null, null)));
        when(places.forTickets(List.of(ticketId))).thenReturn(Map.of(ticketId, new TicketPlaces.Place(
                performanceId, UUID.randomUUID(), TITLE, "Nhà hát Sông Hồng", OffsetDateTime.now(), ZONE,
                "Ban công", "B", "12")));

        var document = new OrderETicketPdfService(orders, tickets, concerts, places)
                .createForOrder(orderId).orElseThrow();
        try (var pdf = Loader.loadPDF(document.content())) {
            assertThat(new PDFTextStripper().getText(pdf)).contains(TITLE, ZONE, "Nhà hát Sông Hồng", "Ban công", "B", "12");
        }
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

    @Test
    void salesPdfAndCsvKeepVietnameseNames() throws Exception {
        UUID performance = UUID.randomUUID(), event = UUID.randomUUID();
        var scope = new SalesReportResponses.Scope("EVENT", event, null, TITLE);
        var summary = new SalesReportResponses.Summary(scope, java.time.LocalDate.of(2026, 12, 1),
                java.time.LocalDate.of(2026, 12, 5), "Asia/Ho_Chi_Minh", true, 2, 1, 1, 1, 10L,
                BigDecimal.TEN, 200000L, 100000L, 100000L);
        var trend = new SalesReportResponses.Trend("day", "Asia/Ho_Chi_Minh", summary.from(), summary.to(), true,
                List.of(new SalesReportResponses.TrendBucket(java.time.LocalDateTime.of(2026, 12, 1, 0, 0),
                        2, 1, 1, 1, 200000L, 100000L, 100000L)));
        var row = new SalesReportResponses.BreakdownRow(performance, performance, event, ZONE, null, TITLE,
                OffsetDateTime.now(), true, 2, 1, 1, 1, 10L, BigDecimal.TEN, 200000L, 100000L, 100000L);
        var rows = new SalesReportResponses.Breakdown("performance", "Asia/Ho_Chi_Minh", summary.from(), summary.to(),
                true, List.of(row));
        var report = new SalesReportResponses.Report(summary, trend, rows, null);
        var exporter = new org.ticketbox.ticketing.reporting.infrastructure.SalesReportExportService();

        verifyPdf(exporter.export(report, "pdf").content());
        var csv = exporter.export(report, "csv");
        assertThat(new String(csv.content(), java.nio.charset.StandardCharsets.UTF_8))
                .startsWith(String.valueOf((char) 0xFEFF)).contains(TITLE, ZONE, "\r\n");
        assertThat(csv.filename()).startsWith("Đêm-nhạc-Ánh-Dương-sales-2026-12-01-to-2026-12-05");
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
