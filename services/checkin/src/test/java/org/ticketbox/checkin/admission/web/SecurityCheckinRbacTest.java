package org.ticketbox.checkin.admission.web;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.ticketbox.checkin.admission.application.CheckinService;
import org.ticketbox.checkin.config.SecurityConfig;
import org.ticketbox.checkin.guestlist.application.GuestListService;
import org.ticketbox.checkin.guestlist.web.StaffGuestListController;
import org.ticketbox.checkin.infrastructure.security.JwtService;

import java.util.Collections;
import java.util.UUID;

@WebMvcTest(
        controllers = {
            StaffCheckinController.class,
            StaffCheckinDatasetController.class,
            StaffGuestListController.class
        })
@Import(SecurityConfig.class)
class SecurityCheckinRbacTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private CheckinService checkinService;

    @MockBean private GuestListService guestListService;

    @MockBean private JwtService jwtService;

    private final UUID staffId = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private final UUID concertId = UUID.fromString("22222222-2222-2222-2222-222222222222");

    private UsernamePasswordAuthenticationToken auth(String role) {
        return new UsernamePasswordAuthenticationToken(
                staffId.toString(),
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role)));
    }

    @Test
    void staffOnlyEndpointUsesEnglishForForbiddenResponseWhenRequested() throws Exception {
        mockMvc.perform(
                        get("/api/staff/concerts")
                                .header("Accept-Language", "en")
                                .with(authentication(auth("AUDIENCE"))))
                .andExpect(status().isForbidden())
                .andExpect(
                        jsonPath("$.message")
                                .value("You do not have permission to perform this action"));
    }

    @Test
    void checkinEndpoints_WithoutAuthentication_Return401() throws Exception {
        mockMvc.perform(
                        post("/api/staff/checkins/scan")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"qrCode\":\"test\",\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(
                        post("/api/staff/checkins/sync")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkin-dataset"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts")).andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/overview"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/tickets"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkins"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void staffOnlyEndpoints_WithAudience_Return403() throws Exception {
        UsernamePasswordAuthenticationToken audience = auth("AUDIENCE");

        mockMvc.perform(
                        post("/api/staff/checkins/scan")
                                .with(authentication(audience))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"qrCode\":\"test\",\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        post("/api/staff/checkins/sync")
                                .with(authentication(audience))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkin-dataset")
                                .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts").with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/overview")
                                .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/tickets")
                                .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567")
                                .with(authentication(audience)))
                .andExpect(status().isForbidden());
    }

    @Test
    void staffOnlyEndpoints_WithOrganizer_Return403() throws Exception {
        UsernamePasswordAuthenticationToken organizer = auth("ORGANIZER");

        mockMvc.perform(
                        post("/api/staff/checkins/scan")
                                .with(authentication(organizer))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"qrCode\":\"test\",\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        post("/api/staff/checkins/sync")
                                .with(authentication(organizer))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkin-dataset")
                                .with(authentication(organizer)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567")
                                .with(authentication(organizer)))
                .andExpect(status().isForbidden());
    }

    @Test
    void legacyCheckinRoutesAreDisabledForStaff() throws Exception {
        UsernamePasswordAuthenticationToken staff = auth("STAFF");
        mockMvc.perform(
                        post("/api/staff/checkins/scan")
                                .with(authentication(staff))
                                .header("Accept-Language", "en")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"qrCode\":\"test\",\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        post("/api/staff/checkins/sync")
                                .with(authentication(staff))
                                .header("Accept-Language", "vi-VN")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        "{\"concertId\":\""
                                                + concertId
                                                + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkin-dataset")
                                .with(authentication(staff)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts").with(authentication(staff)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/overview")
                                .with(authentication(staff)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/tickets")
                                .with(authentication(staff)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567")
                                .with(authentication(staff)))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkins")
                                .with(authentication(staff)))
                .andExpect(status().isForbidden());
        org.mockito.Mockito.verifyNoInteractions(checkinService, guestListService);
    }

    @Test
    void legacyHistoryIsDisabledForOrganizerAndAdmin() throws Exception {
        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkins")
                                .with(authentication(auth("ORGANIZER"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkins")
                                .with(authentication(auth("ADMIN"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(
                        get("/api/staff/concerts/" + concertId + "/checkins")
                                .with(authentication(auth("AUDIENCE"))))
                .andExpect(status().isForbidden());
    }
}
