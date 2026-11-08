package org.ticketbox.catalog.concert.web;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.ticketbox.catalog.concert.application.ConcertService;
import org.ticketbox.catalog.sales.application.TicketTypeService;
import org.ticketbox.catalog.sales.application.dto.TicketTypeAvailabilityResponse;
import org.ticketbox.catalog.web.ApiMessages;
import org.ticketbox.catalog.web.CatalogErrorAdvice;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

class PublicConcertControllerTest {
    @Test
    void exposesInventorySeparatelyWithShortPublicCacheLifetime() throws Exception {
        UUID concert = UUID.randomUUID();
        var tickets = mock(TicketTypeService.class);
        when(tickets.getAvailability(concert))
                .thenReturn(
                        new TicketTypeAvailabilityResponse(
                                concert, List.of(), OffsetDateTime.now()));
        var mvc =
                MockMvcBuilders.standaloneSetup(
                                new ConcertController(mock(ConcertService.class), tickets))
                        .build();
        mvc.perform(get("/api/concerts/" + concert + "/availability"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "max-age=1, public"))
                .andExpect(jsonPath("data.concertId").value(concert.toString()))
                .andExpect(jsonPath("data.refreshedAt").exists());
    }

    @Test
    void persistenceErrorsKeepTheirStatusAndUseTheRequestedLanguage() throws Exception {
        UUID concert = UUID.randomUUID();
        var tickets = mock(TicketTypeService.class);
        when(tickets.getAvailability(concert))
                .thenThrow(
                        new DataIntegrityViolationException(
                                "Ticket type can be edited only while the concert is DRAFT"));
        var source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        var messages = new ApiMessages(source, "en,vi", "vi");
        var mvc =
                MockMvcBuilders.standaloneSetup(
                                new ConcertController(mock(ConcertService.class), tickets))
                        .setLocaleResolver(messages.localeResolver())
                        .setControllerAdvice(new CatalogErrorAdvice(), messages)
                        .build();
        String path = "/api/concerts/" + concert + "/availability";

        mvc.perform(get(path).header("Accept-Language", "en"))
                .andExpect(status().isConflict())
                .andExpect(
                        jsonPath("$.message")
                                .value(
                                        "Prices, quantities and ticket types can only be changed while the concert is a draft"));
        mvc.perform(get(path).header("Accept-Language", "vi"))
                .andExpect(status().isConflict())
                .andExpect(
                        jsonPath("$.message")
                                .value(
                                        "Chỉ chỉnh giá, số lượng và danh sách hạng vé khi concert ở trạng thái DRAFT"));

        doThrow(new DataIntegrityViolationException("Unexpected database constraint"))
                .when(tickets)
                .getAvailability(concert);
        mvc.perform(get(path).header("Accept-Language", "en"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Could not save the concert configuration"));
        mvc.perform(get(path).header("Accept-Language", "vi"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Không thể lưu cấu hình concert"));
    }
}
