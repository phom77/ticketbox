package com.ticketbox.module.concert.web;

import com.ticketbox.module.concert.application.ConcertService;
import com.ticketbox.module.concert.application.TicketTypeService;
import com.ticketbox.module.concert.web.dto.TicketTypeAvailabilityResponse;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PublicConcertControllerTest {
    @Test
    void exposesInventorySeparatelyWithShortPublicCacheLifetime() throws Exception {
        UUID concert = UUID.randomUUID();
        var tickets = mock(TicketTypeService.class);
        when(tickets.getAvailability(concert)).thenReturn(new TicketTypeAvailabilityResponse(
                concert, List.of(), OffsetDateTime.now()));
        var mvc = MockMvcBuilders.standaloneSetup(new ConcertController(mock(ConcertService.class), tickets)).build();
        mvc.perform(get("/api/concerts/" + concert + "/availability"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "max-age=1, public"))
                .andExpect(jsonPath("data.concertId").value(concert.toString()))
                .andExpect(jsonPath("data.refreshedAt").exists());
    }
}
