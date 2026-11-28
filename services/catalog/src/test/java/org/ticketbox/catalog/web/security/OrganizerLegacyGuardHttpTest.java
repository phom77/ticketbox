package org.ticketbox.catalog.web.security;

import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.ticketbox.catalog.concert.application.ConcertPosterService;
import org.ticketbox.catalog.concert.application.ConcertPublicationReview;
import org.ticketbox.catalog.concert.application.ConcertService;
import org.ticketbox.catalog.concert.application.port.OrganizerDisplayNames;
import org.ticketbox.catalog.concert.web.AdminConcertController;
import org.ticketbox.catalog.concert.web.OrganizerConcertController;
import org.ticketbox.catalog.web.GlobalExceptionHandler;

/** The guard through the real controllers: organizer legacy writes are refused, reads and Admin writes work. */
class OrganizerLegacyGuardHttpTest {
    private static final String ORGANIZER = "/api/organizer/manage/concerts/";
    private final UUID concert = UUID.randomUUID();
    private final UUID organization = UUID.randomUUID();

    private MockMvc mvc(boolean readOnly) {
        var service = mock(ConcertService.class);
        var posters = mock(ConcertPosterService.class);
        var publication = mock(ConcertPublicationReview.class);
        return MockMvcBuilders.standaloneSetup(new OrganizerConcertController(service, posters, publication),
                        new AdminConcertController(service, posters, publication, mock(OrganizerDisplayNames.class)))
                .addMappedInterceptors(new String[] {"/api/organizer/**"}, new OrganizerLegacyGuard(readOnly))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder as(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, UUID user, String role) {
        return request.principal(new UsernamePasswordAuthenticationToken(
                user.toString(), null, List.of(new SimpleGrantedAuthority(role))));
    }

    @Test
    void organizerWritesToLegacyConcertsAreRefusedWithForbidden() throws Exception {
        var mvc = mvc(true);
        var body = "{\"status\":\"DRAFT\"}";
        var submit = "{\"publishAt\":\"" + OffsetDateTime.now().plusDays(1) + "\"}";
        var requests = List.of(
                patch(ORGANIZER + concert + "/status").contentType(MediaType.APPLICATION_JSON).content(body),
                post(ORGANIZER + concert + "/publication").contentType(MediaType.APPLICATION_JSON).content(submit),
                delete(ORGANIZER + concert));
        for (var request : requests) {
            mvc.perform(as(request.requestAttr(OrganizationAccess.ORGANIZATION, organization), concert, "ROLE_ORGANIZER"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.message").value("error.concert.organizer-legacy-read-only"));
        }
        mvc.perform(put(ORGANIZER + concert).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .requestAttr(OrganizationAccess.ORGANIZATION, organization))
                .andExpect(status().isForbidden());
    }

    @Test
    void organizerReadsStayAvailable() throws Exception {
        mvc(true).perform(as(get(ORGANIZER + concert + "/publication")
                        .requestAttr(OrganizationAccess.ORGANIZATION, organization), concert, "ROLE_ORGANIZER"))
                .andExpect(status().isOk());
    }

    @Test
    void adminLegacyWritesAreNotGuarded() throws Exception {
        var admin = UUID.randomUUID();
        mvc(true).perform(as(patch("/api/admin/concerts/" + concert + "/status")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DRAFT\"}"), admin, "ROLE_ADMIN"))
                .andExpect(status().isOk());
        mvc(true).perform(as(delete("/api/admin/concerts/" + concert), admin, "ROLE_ADMIN"))
                .andExpect(status().isOk());
    }

    @Test
    void theRollbackFlagReopensOrganizerWrites() throws Exception {
        mvc(false).perform(as(delete(ORGANIZER + concert)
                        .requestAttr(OrganizationAccess.ORGANIZATION, organization), concert, "ROLE_ORGANIZER"))
                .andExpect(status().isOk());
    }
}
