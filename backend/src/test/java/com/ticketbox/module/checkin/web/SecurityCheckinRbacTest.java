package com.ticketbox.module.checkin.web;

import com.ticketbox.infrastructure.security.JwtService;
import com.ticketbox.infrastructure.security.SecurityConfig;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.checkin.application.CheckinService;
import com.ticketbox.module.admin.application.GuestListService;
import com.ticketbox.module.admin.web.StaffGuestListController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Collections;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = {StaffCheckinController.class, StaffCheckinDatasetController.class, StaffGuestListController.class})
@Import(SecurityConfig.class)
class SecurityCheckinRbacTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private CheckinService checkinService;

    @MockBean
    private GuestListService guestListService;

    @MockBean
    private JwtService jwtService;

    @MockBean
    private UserRepository userRepository;

    private final UUID staffId = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private final UUID concertId = UUID.fromString("22222222-2222-2222-2222-222222222222");

    private UsernamePasswordAuthenticationToken auth(User.Role role) {
        return new UsernamePasswordAuthenticationToken(
                staffId.toString(),
                null,
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.name()))
        );
    }

    @Test
    void checkinEndpoints_WithoutAuthentication_Return401() throws Exception {
        mockMvc.perform(post("/api/staff/checkins/scan")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrCode\":\"test\",\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/staff/checkins/sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkin-dataset"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/staff/concerts"))
                .andExpect(status().isUnauthorized());

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
        UsernamePasswordAuthenticationToken audience = auth(User.Role.AUDIENCE);

        mockMvc.perform(post("/api/staff/checkins/scan")
                        .with(authentication(audience))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrCode\":\"test\",\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/staff/checkins/sync")
                        .with(authentication(audience))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkin-dataset")
                        .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts")
                        .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/overview")
                        .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/tickets")
                        .with(authentication(audience)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567")
                        .with(authentication(audience)))
                .andExpect(status().isForbidden());
    }

    @Test
    void staffOnlyEndpoints_WithOrganizer_Return403() throws Exception {
        UsernamePasswordAuthenticationToken organizer = auth(User.Role.ORGANIZER);

        mockMvc.perform(post("/api/staff/checkins/scan")
                        .with(authentication(organizer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrCode\":\"test\",\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/staff/checkins/sync")
                        .with(authentication(organizer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkin-dataset")
                        .with(authentication(organizer)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567")
                        .with(authentication(organizer)))
                .andExpect(status().isForbidden());
    }

    @Test
    void checkinEndpoints_WithStaff_ReturnSuccess() throws Exception {
        UsernamePasswordAuthenticationToken staff = auth(User.Role.STAFF);

        mockMvc.perform(post("/api/staff/checkins/scan")
                        .with(authentication(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"qrCode\":\"test\",\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"gate\":\"A\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/staff/checkins/sync")
                        .with(authentication(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"concertId\":\"" + concertId + "\",\"deviceId\":\"dev1\",\"logs\":[{\"qrCode\":\"test\",\"checkedAt\":\"2026-06-16T14:00:00Z\"}]}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkin-dataset")
                        .with(authentication(staff)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts")
                        .with(authentication(staff)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/overview")
                        .with(authentication(staff)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/tickets")
                        .with(authentication(staff)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/guestlist?concert_id=" + concertId + "&phone=0901234567")
                        .with(authentication(staff)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkins")
                        .with(authentication(staff)))
                .andExpect(status().isOk());
    }

    @Test
    void getCheckins_WithOrganizerAndAdmin_ReturnSuccess() throws Exception {
        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkins")
                        .with(authentication(auth(User.Role.ORGANIZER))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkins")
                        .with(authentication(auth(User.Role.ADMIN))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/staff/concerts/" + concertId + "/checkins")
                        .with(authentication(auth(User.Role.AUDIENCE))))
                .andExpect(status().isForbidden());
    }
}
