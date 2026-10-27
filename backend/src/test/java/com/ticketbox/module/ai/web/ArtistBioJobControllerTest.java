package com.ticketbox.module.ai.web;

import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.ai.application.ArtistBioJobService;
import com.ticketbox.module.ai.application.ArtistBioComposerService;
import com.ticketbox.module.ai.web.dto.ArtistBioJobResponse;
import com.ticketbox.module.auth.domain.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = ArtistBioJobController.class)
@Import(SecurityConfig.class)
class ArtistBioJobControllerTest {

    @MockBean private ArtistBioComposerService composerService;
    @Autowired private MockMvc mockMvc;
    @MockBean private ArtistBioJobService jobService;
    @MockBean private JwtService jwtService;
    @MockBean private UserRepository userRepository;

    @Test
    void list_AsOrganizer_ReturnsFilteredJobs() throws Exception {
        UUID organizerId = UUID.randomUUID();
        UUID concertId = UUID.randomUUID();
        when(jobService.list(
                eq(organizerId), eq(false), eq(concertId),
                eq(com.ticketbox.module.ai.domain.ArtistPdfJob.Status.DONE), any()))
                .thenReturn(new PageImpl<>(List.of(response(concertId))));

        mockMvc.perform(get("/api/admin/artist-bio-jobs")
                        .param("concertId", concertId.toString())
                        .param("status", "DONE")
                        .with(authentication(auth(organizerId, "ORGANIZER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].status").value("DONE"))
                .andExpect(jsonPath("$.data.content[0].concertId").value(concertId.toString()));
    }

    @Test
    void list_AsAudience_IsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/artist-bio-jobs")
                        .with(authentication(auth(UUID.randomUUID(), "AUDIENCE"))))
                .andExpect(status().isForbidden());
    }

    private UsernamePasswordAuthenticationToken auth(UUID userId, String role) {
        return new UsernamePasswordAuthenticationToken(
                userId.toString(), null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    private ArtistBioJobResponse response(UUID concertId) {
        OffsetDateTime now = OffsetDateTime.now();
        return new ArtistBioJobResponse(
                UUID.randomUUID(), concertId, "artist.pdf", "DONE",
                "mock", "local-deterministic", 1200, "Generated bio", null,
                now.minusSeconds(2), now, null, null, now.minusSeconds(3), now);
    }
}
