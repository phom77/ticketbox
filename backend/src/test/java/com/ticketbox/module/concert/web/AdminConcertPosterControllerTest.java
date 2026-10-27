package com.ticketbox.module.concert.web;

import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.concert.application.ConcertPosterService;
import com.ticketbox.module.concert.application.ConcertService;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AdminConcertController.class)
@Import(SecurityConfig.class)
class AdminConcertPosterControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ConcertService concertService;

    @MockBean
    private ConcertPosterService concertPosterService;

    @MockBean
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    @Test
    void replacePoster_AsOrganizer_ReturnsUpdatedConcert() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID organizerId = UUID.randomUUID();
        MockMultipartFile file = new MockMultipartFile(
                "file", "poster.jpg", "image/jpeg",
                new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF});
        when(concertPosterService.replacePoster(eq(concertId), any(), eq(organizerId), eq(false)))
                .thenReturn(response(concertId, organizerId, "https://cloudinary/poster.jpg"));

        mockMvc.perform(multipart("/api/admin/concerts/{id}/poster", concertId)
                        .file(file)
                        .with(request -> {
                            request.setMethod("PUT");
                            return request;
                        })
                        .with(authentication(auth(organizerId, "ORGANIZER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.posterUrl").value("https://cloudinary/poster.jpg"));
    }

    @Test
    void replacePoster_AsAudience_IsForbidden() throws Exception {
        UUID concertId = UUID.randomUUID();
        MockMultipartFile file = new MockMultipartFile(
                "file", "poster.jpg", "image/jpeg",
                new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF});

        mockMvc.perform(multipart("/api/admin/concerts/{id}/poster", concertId)
                        .file(file)
                        .with(request -> {
                            request.setMethod("PUT");
                            return request;
                        })
                        .with(authentication(auth(UUID.randomUUID(), "AUDIENCE"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void removePoster_AsAdmin_ReturnsUpdatedConcert() throws Exception {
        UUID concertId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        when(concertPosterService.removePoster(concertId, adminId, true))
                .thenReturn(response(concertId, adminId, null));

        mockMvc.perform(delete("/api/admin/concerts/{id}/poster", concertId)
                        .with(authentication(auth(adminId, "ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.posterUrl").doesNotExist());
    }

    private UsernamePasswordAuthenticationToken auth(UUID userId, String role) {
        return new UsernamePasswordAuthenticationToken(
                userId.toString(), null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    private ConcertDetailResponse response(UUID concertId, UUID creatorId, String posterUrl) {
        OffsetDateTime now = OffsetDateTime.now();
        return new ConcertDetailResponse(
                concertId, "Concert", null, null, "Venue", "Address",
                now.plusDays(1), null, null, null, "DRAFT", null, posterUrl, creatorId, now, now);
    }
}
