package org.ticketbox.checkin.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Testcontainers
@SpringBootTest(properties = {
        "ticketbox.security.jwt.secret=local-scoped-admission-tests-secret-at-least-sixty-four-characters",
        "split.token=local-scoped-admission-tests-service-token",
        "split.identity-url=http://identity-test.invalid",
        "ticketbox.guest-list.cron=-"
})
@AutoConfigureMockMvc
class ScopedCheckinIntegrationTest {
    private static final String TOKEN = "local-scoped-admission-tests-service-token";
    private static final String ORG_HEADER = "X-Organization-Id";
    private static final String STAFF = "/api/v2/staff/performances";
    private static final String MANAGE = "/api/organizer/manage/v2/performances/";
    private static final String PROJECTION = "/internal/checkin/catalog/performances/";
    private static final String TICKETS = "/internal/checkin/tickets/";
    @Container private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired IdentityHttp identity;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    @Test
    void scopedAdmissionRetainsLegacyQrAndRejectsRevokedOrOtherScope() throws Exception {
        UUID org = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        UUID legacy = UUID.fromString("10000000-0000-0000-0000-000000000001");
        jdbc.update("UPDATE concerts SET organization_id=? WHERE id=?", org, legacy);
        String qr = jdbc.queryForObject(
                "SELECT qr_code FROM tickets WHERE concert_id=? AND status='VALID' LIMIT 1",
                String.class, legacy);
        UUID otherNight = UUID.randomUUID();
        publish(otherNight, org, UUID.randomUUID());

        mvc.perform(actor(get(STAFF + "/" + legacy + "/overview"), org, staff, "STAFF"))
                .andExpect(status().isForbidden());
        mvc.perform(actor(put(assignment(legacy, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        mvc.perform(actor(get(STAFF), org, staff, "STAFF"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(legacy.toString()));
        mvc.perform(actor(get(STAFF + "/" + otherNight + "/overview"), org, staff, "STAFF"))
                .andExpect(status().isForbidden());
        mvc.perform(actor(get(STAFF + "/" + legacy + "/checkin-dataset"), org, staff, "STAFF"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tickets[0].qrSecret").doesNotExist())
                .andExpect(jsonPath("$.data.tickets[0].userId").doesNotExist());
        mvc.perform(actor(scan(legacy, qr, "reader-legacy"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("SUCCESS"));
        identity.allow(org, manager, "EVENTS", staff, "FINANCE");
        mvc.perform(actor(sync(legacy, qr, "reader-legacy"), org, staff, "STAFF"))
                .andExpect(status().isForbidden());
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        mvc.perform(actor(delete(assignment(legacy, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        mvc.perform(actor(sync(legacy, qr, "reader-legacy"), org, staff, "STAFF"))
                .andExpect(status().isForbidden());
    }

    @Test
    void scopedScansRejectAnotherNightAndReconcileExactlyOneOfflineAdmission() throws Exception {
        UUID org = UUID.randomUUID();
        UUID otherOrg = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID night = UUID.randomUUID();
        UUID otherNight = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        UUID ticket = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        identity.allow(otherOrg, manager, "EVENTS", staff, "ADMISSION");
        publish(night, org, offer);
        publish(otherNight, otherOrg, UUID.randomUUID());

        mvc.perform(actor(put(assignment(night, staff)), otherOrg, manager, "ORGANIZER"))
                .andExpect(status().isNotFound());
        mvc.perform(actor(put(assignment(night, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        mvc.perform(actor(put(assignment(otherNight, staff)), otherOrg, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());

        var snapshot = ticket(ticket, night, offer);
        String qr = snapshot.path("ticket").path("qr_code").asText();
        mvc.perform(put(TICKETS + ticket).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(snapshot)))
                .andExpect(status().isUnauthorized());
        mvc.perform(service(put(TICKETS + ticket), snapshot)).andExpect(status().isNoContent());
        mvc.perform(actor(scan(otherNight, qr, "wrong-night"), otherOrg, staff, "STAFF"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.ticketId").doesNotExist());
        mvc.perform(actor(get(STAFF + "/" + night + "/tickets"), org, staff, "STAFF"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].seatLabel").value("12"));

        var gate = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> {
                gate.await();
                return sendOffline(night, qr, "reader-a", org, staff);
            });
            var second = workers.submit(() -> {
                gate.await();
                return sendOffline(night, qr, "reader-b", org, staff);
            });
            gate.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("ACCEPTED", "SKIPPED");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkin_logs WHERE ticket_id=?", Long.class, ticket))
                .isOne();
        mvc.perform(service(put(TICKETS + ticket), snapshot.put("version", 2)))
                .andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT status FROM tickets WHERE id=?", String.class, ticket))
                .isEqualTo("USED");
    }

    @Test
    void staffCanFindATicketByReferenceWhileAdmissionStillRequiresItsQr() throws Exception {
        UUID org = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID performance = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        publish(performance, org, offer);
        mvc.perform(actor(put(assignment(performance, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());

        var snapshot = ticket(id, performance, offer);
        var payload = (ObjectNode) snapshot.path("ticket");
        String qr = payload.path("qr_code").asText();
        payload.put("reference_code", "VE-10000007").put("ticket_type_name", "Balcony admission");
        mvc.perform(service(put(TICKETS + id), snapshot)).andExpect(status().isNoContent());

        // A delivery from a compatible older producer omits optional display fields.
        payload.remove(List.of("reference_code", "ticket_type_name"));
        mvc.perform(service(put(TICKETS + id), snapshot.put("version", 2))).andExpect(status().isNoContent());

        mvc.perform(actor(get(STAFF + "/" + performance + "/tickets").param("query", "ve-10000007"),
                        org, staff, "STAFF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].referenceCode").value("VE-10000007"))
                .andExpect(jsonPath("$.data.content[0].ticketTypeName").value("Balcony admission"));
        mvc.perform(actor(get(STAFF + "/" + performance + "/checkin-dataset"), org, staff, "STAFF"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tickets[0].referenceCode").value("VE-10000007"))
                .andExpect(jsonPath("$.data.tickets[0].ticketTypeName").value("Balcony admission"));
        mvc.perform(actor(scan(performance, "VE-10000007", "reader"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("FAILED"));
        mvc.perform(actor(scan(performance, qr, "reader"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("SUCCESS"));
        mvc.perform(actor(get(STAFF + "/" + performance + "/checkins"), org, staff, "STAFF"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].referenceCode").value("VE-10000007"));
    }

    @Test
    void organizerSeesGateCountsGuestsAndAdmissionsWithoutCredentials() throws Exception {
        UUID org = UUID.randomUUID();
        UUID otherOrg = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID performance = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        identity.allow(otherOrg, manager, "EVENTS", UUID.randomUUID(), "ADMISSION");
        publish(performance, org, offer);
        mvc.perform(actor(put(assignment(performance, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        String[] codes = new String[3];
        for (int i = 0; i < codes.length; i++) {
            UUID id = UUID.randomUUID();
            var snapshot = ticket(id, performance, offer);
            codes[i] = snapshot.path("ticket").path("qr_code").asText();
            mvc.perform(service(put(TICKETS + id), snapshot)).andExpect(status().isNoContent());
        }
        mvc.perform(actor(scan(performance, codes[0], "web-1", "North"), org, staff, "STAFF"))
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
        mvc.perform(actor(scan(performance, codes[1], "web-1", "North"), org, staff, "STAFF"))
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
        mvc.perform(actor(scan(performance, codes[2], "web-2", null), org, staff, "STAFF"))
                .andExpect(jsonPath("$.data.status").value("SUCCESS"));
        // The same ticket again is not admitted twice.
        mvc.perform(actor(scan(performance, codes[0], "web-2", "South"), org, staff, "STAFF"))
                .andExpect(jsonPath("$.data.status").value("FAILED"));
        for (int i = 0; i < 3; i++) {
            jdbc.update("INSERT INTO guest_lists (concert_id, phone, full_name, checked_in_at) VALUES (?,?,?,?)",
                    performance, "09000000" + i, "Guest " + i, i == 0 ? OffsetDateTime.now(ZoneOffset.UTC) : null);
        }
        jdbc.update("INSERT INTO guest_lists (concert_id, phone, full_name, is_active) VALUES (?,?,?,false)",
                performance, "0911111111", "Removed guest");

        mvc.perform(actor(get("/api/organizer/manage/concerts/" + performance + "/checkin-summary"),
                        org, manager, "ORGANIZER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.checkedIn").value(3))
                .andExpect(jsonPath("$.data.onlineCheckins").value(3))
                .andExpect(jsonPath("$.data.offlineCheckins").value(0))
                .andExpect(jsonPath("$.data.validTickets").value(0))
                .andExpect(jsonPath("$.data.guestsTotal").value(3))
                .andExpect(jsonPath("$.data.guestsCheckedIn").value(1))
                .andExpect(jsonPath("$.data.gates.length()").value(2))
                .andExpect(jsonPath("$.data.gates[?(@.gate=='North')].checkedIn").value(2))
                .andExpect(jsonPath("$.data.gates[?(@.gate==null)].checkedIn").value(1));

        mvc.perform(actor(get(MANAGE + performance + "/checkins"), org, manager, "ORGANIZER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3))
                                .andExpect(jsonPath("$.data.content[0].qrCode").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].deviceId").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].staffId").value(staff.toString()))
                .andExpect(jsonPath("$.data.content[0].ticketId").exists());
        mvc.perform(actor(get(MANAGE + performance + "/checkins").param("size", "51"), org, manager, "ORGANIZER"))
                .andExpect(status().is4xxClientError());
        mvc.perform(actor(get(MANAGE + performance + "/checkins"), otherOrg, manager, "ORGANIZER"))
                .andExpect(status().isNotFound());
        identity.allow(org, manager, "FINANCE", staff, "ADMISSION");
        mvc.perform(actor(get(MANAGE + performance + "/checkins"), org, manager, "ORGANIZER"))
                .andExpect(status().isForbidden());
        mvc.perform(actor(get("/api/organizer/manage/concerts/" + performance + "/checkin-summary"),
                        org, manager, "ORGANIZER"))
                .andExpect(status().isForbidden());
    }

    /** The scanner reads these exact fields; a change here must be agreed with the scanner first. */
    @Test
    void staffResponsesKeepTheShapesTheScannerReads() throws Exception {
        UUID org = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID performance = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        publish(performance, org, offer);
        mvc.perform(actor(put(assignment(performance, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        var snapshot = ticket(id, performance, offer);
        String qr = snapshot.path("ticket").path("qr_code").asText();
        mvc.perform(service(put(TICKETS + id), snapshot)).andExpect(status().isNoContent());

        jdbc.update("INSERT INTO guest_lists (concert_id, phone, full_name) VALUES (?,?,?)",
                performance, "0900000001", "Guest One");

        // The dataset lists tickets still admissible, so read it before the scan.
        var dataset = mvc.perform(actor(get(STAFF + "/" + performance + "/checkin-dataset"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn();
        assertShape(dataset, "/data", "concertId:string", "generatedAt:string", "totalCount:number",
                "tickets:array");
        assertShape(dataset, "/data/tickets/0",
                "ticketId:string", "qrCode:string", "ticketTypeId:string?", "referenceCode:string?",
                "ticketTypeName:string?");
        assertShape(mvc.perform(actor(scan(performance, qr, "reader", "Gate 1"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn(), "/data",
                "ticketId:string", "concertId:string", "status:string", "message:string", "checkAt:string");
        assertShape(mvc.perform(actor(get(STAFF), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn(), "/data/content/0",
                "id:string", "title:string", "venueName:string", "eventDate:string", "status:string");
        assertShape(mvc.perform(actor(get(STAFF + "/" + performance + "/overview"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn(), "/data",
                "concert:object", "totalTickets:number", "validTickets:number", "usedTickets:number",
                "cancelledTickets:number", "transferredTickets:number", "totalCheckins:number",
                "datasetUpdatedAt:string?");
        assertShape(mvc.perform(actor(get(STAFF + "/" + performance + "/tickets"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn(), "/data/content/0",
                "ticketId:string", "ticketTypeId:string?", "qrCode:string", "status:string",
                "issuedAt:string?", "usedAt:string?", "sectionLabel:string?", "rowLabel:string?",
                "seatLabel:string?", "referenceCode:string?", "ticketTypeName:string?");
        assertShape(mvc.perform(actor(get(STAFF + "/" + performance + "/checkins"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn(), "/data/content/0",
                "id:string", "ticketId:string", "concertId:string", "staffId:string", "deviceId:string",
                "checkedAt:string", "syncAt:string?", "offline:boolean", "gate:string?", "qrCode:string",
                "ticketStatus:string", "referenceCode:string?", "ticketTypeName:string?");
        var guests = mvc.perform(actor(get(STAFF + "/" + performance + "/guests"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn();
        assertShape(guests, "/data/content/0",
                "found:boolean", "guestId:string", "concertId:string", "phone:string", "fullName:string",
                "category:string?", "sponsorName:string?", "notes:string?", "checkedInAt:string?",
                "checkinGate:string?");
        String guestId = json.readTree(guests.getResponse().getContentAsString())
                .at("/data/content/0/guestId").asText();
        var guestCheckin = mvc.perform(actor(post(STAFF + "/" + performance + "/guests/" + guestId + "/check-in")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"gate\":\"Gate 1\"}"),
                        org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn();
        assertShape(guestCheckin, "/data",
                "found:boolean", "guestId:string", "concertId:string", "phone:string", "fullName:string",
                "checkedInAt:string", "checkinGate:string");
        var synced = mvc.perform(actor(sync(performance, qr, "reader"), org, staff, "STAFF"))
                .andExpect(status().isOk()).andReturn();
        assertShape(synced, "/data", "total:number", "accepted:number", "skipped:number", "invalid:number",
                "results:array");
        assertShape(synced, "/data/results/0", "qrCode:string", "result:string", "reason:string?");
        mvc.perform(actor(get("/api/staff/concerts"), org, staff, "STAFF"))
                .andExpect(status().isForbidden());
    }

    @Test
    void concurrentScansOfOneTicketAdmitItOnce() throws Exception {
        UUID org = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID performance = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        publish(performance, org, offer);
        mvc.perform(actor(put(assignment(performance, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        var snapshot = ticket(id, performance, offer);
        String qr = snapshot.path("ticket").path("qr_code").asText();
        mvc.perform(service(put(TICKETS + id), snapshot)).andExpect(status().isNoContent());

        var start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var first = workers.submit(() -> {
                start.await();
                return scanStatus(performance, qr, "web-a", org, staff);
            });
            var second = workers.submit(() -> {
                start.await();
                return scanStatus(performance, qr, "web-b", org, staff);
            });
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("SUCCESS", "FAILED");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkin_logs WHERE ticket_id=?", Long.class, id))
                .isOne();
    }

    private String scanStatus(UUID performance, String qr, String device, UUID org, UUID actor)
            throws Exception {
        return json.readTree(mvc.perform(actor(scan(performance, qr, device), org, actor, "STAFF"))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .path("data").path("status").asText();
    }

    @Test
    void revokedStaffLosesEveryScopedRouteOnTheNextRequest() throws Exception {
        UUID org = UUID.randomUUID();
        UUID manager = UUID.randomUUID();
        UUID staff = UUID.randomUUID();
        UUID performance = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        identity.allow(org, manager, "EVENTS", staff, "ADMISSION");
        publish(performance, org, offer);
        mvc.perform(actor(put(assignment(performance, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        var snapshot = ticket(id, performance, offer);
        String qr = snapshot.path("ticket").path("qr_code").asText();
        mvc.perform(service(put(TICKETS + id), snapshot)).andExpect(status().isNoContent());
        mvc.perform(actor(delete(assignment(performance, staff)), org, manager, "ORGANIZER"))
                .andExpect(status().isNoContent());
        for (String path : List.of("/overview", "/tickets", "/checkins", "/guests")) {
            mvc.perform(actor(get(STAFF + "/" + performance + path), org, staff, "STAFF"))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(actor(scan(performance, qr, "reader", null), org, staff, "STAFF"))
                .andExpect(status().isForbidden());
        mvc.perform(actor(get(STAFF), org, staff, "STAFF"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content.length()").value(0));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkin_logs WHERE ticket_id=?", Long.class, id))
                .isZero();
    }

    /** Each entry is name:type with type string, number, boolean, object or array; a trailing ? allows null. */
    private void assertShape(org.springframework.test.web.servlet.MvcResult result, String pointer,
                             String... fields) throws Exception {
        var node = json.readTree(result.getResponse().getContentAsString()).at(pointer);
        for (String field : fields) {
            String[] parts = field.split(":");
            boolean nullable = parts[1].endsWith("?");
            String type = nullable ? parts[1].substring(0, parts[1].length() - 1) : parts[1];
            var value = node.path(parts[0]);
            assertThat(node.has(parts[0])).as(pointer + " has " + parts[0]).isTrue();
            if (nullable && value.isNull()) continue;
            boolean matches = switch (type) {
                case "string" -> value.isTextual();
                case "number" -> value.isNumber();
                case "boolean" -> value.isBoolean();
                case "object" -> value.isObject();
                case "array" -> value.isArray();
                default -> throw new IllegalArgumentException(type);
            };
            assertThat(matches).as(pointer + "/" + parts[0] + " is " + type + " but was " + value).isTrue();
        }
    }

    private String sendOffline(UUID performance, String qr, String device, UUID org, UUID actor)
            throws Exception {
        return json.readTree(mvc.perform(actor(sync(performance, qr, device), org, actor, "STAFF"))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .path("data").path("results").get(0).path("result").asText();
    }

    private void publish(UUID performance, UUID org, UUID offer) throws Exception {
        publish(performance, org, offer, 1, snapshot -> { });
    }

    @Test
    void projectionAppliesSnapshotsWithAndWithoutClassificationFields() throws Exception {
        UUID performance = UUID.randomUUID();
        UUID org = UUID.randomUUID();
        UUID offer = UUID.randomUUID();
        publish(performance, org, offer, 1, snapshot -> { });
        publish(performance, org, offer, 2, snapshot -> snapshot.put("segment", "concerts")
                .put("primaryGenre", "vpop").put("city", "Hanoi"));
        publish(performance, org, offer, 3, snapshot -> snapshot.putNull("segment").putNull("primaryGenre").putNull("city"));
        assertThat(jdbc.queryForObject("SELECT performance_snapshot_version FROM concerts WHERE id=?", Long.class,
                performance)).isEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT title FROM concerts WHERE id=?", String.class, performance))
                .isEqualTo("Test performance");
    }

    private void publish(UUID performance, UUID org, UUID offer, int version,
                         java.util.function.Consumer<ObjectNode> extra) throws Exception {
        var snapshot = json.createObjectNode();
        snapshot.put("id", performance.toString());
        snapshot.put("eventId", UUID.randomUUID().toString());
        snapshot.put("organizationId", org.toString());
        snapshot.put("version", version);
        snapshot.put("layoutVersion", 1);
        snapshot.put("layoutChecksum", "fixture");
        snapshot.putNull("legacyConcertId");
        snapshot.put("title", "Test performance");
        snapshot.put("venueName", "Test venue");
        snapshot.put("startsAt", "2040-07-15T19:00:00+07:00");
        snapshot.put("endsAt", "2040-07-15T21:00:00+07:00");
        snapshot.putNull("doorsOpenAt");
        snapshot.put("timezone", "Asia/Ho_Chi_Minh");
        snapshot.put("saleStartAt", "2026-07-15T19:00:00+07:00");
        snapshot.put("saleEndAt", "2040-07-15T19:00:00+07:00");
        snapshot.put("status", "ON_SALE");
        snapshot.put("salesSuspended", false);
        snapshot.put("publicVisible", true);
        snapshot.put("maxPerAccount", 4);
        snapshot.putArray("groups");
        snapshot.putArray("offers").addObject()
                .put("id", offer.toString()).put("name", "Main floor")
                .put("price", 100_000).put("active", true);
        extra.accept(snapshot);
        mvc.perform(service(put(PROJECTION + performance), snapshot))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(version));
    }

    private ObjectNode ticket(UUID id, UUID performance, UUID offer) {
        String now = OffsetDateTime.now(ZoneOffset.UTC).toString();
        String secret = "per-ticket-local-signing-secret-at-least-32-bytes";
        String qr = Jwts.builder().id(id.toString()).signWith(Keys.hmacShaKeyFor(
                secret.getBytes(StandardCharsets.UTF_8))).compact();
        var envelope = json.createObjectNode().put("id", id.toString()).put("version", 1);
        envelope.putObject("ticket")
                .put("id", id.toString()).put("order_item_id", UUID.randomUUID().toString())
                .put("ticket_type_id", offer.toString()).put("concert_id", performance.toString())
                .put("performance_id", performance.toString()).put("user_id", UUID.randomUUID().toString())
                .put("qr_code", qr).put("qr_secret", secret).put("status", "VALID")
                .put("issued_at", now).put("created_at", now).put("updated_at", now).putNull("used_at")
                .put("section_label", "Balcony").put("row_label", "A").put("seat_label", "12");
        return envelope;
    }

    private String assignment(UUID performance, UUID staff) {
        return MANAGE + performance + "/staff/" + staff;
    }

    private MockHttpServletRequestBuilder scan(UUID performance, String qr, String device) {
        return scan(performance, qr, device, null);
    }

    private MockHttpServletRequestBuilder scan(UUID performance, String qr, String device, String gate) {
        var body = json.createObjectNode().put("qrCode", qr).put("deviceId", device);
        if (gate != null) body.put("gate", gate);
        return post(STAFF + "/" + performance + "/scan").contentType(MediaType.APPLICATION_JSON)
                .content(body.toString());
    }

    private MockHttpServletRequestBuilder sync(UUID performance, String qr, String device) {
        var payload = json.createObjectNode().put("deviceId", device);
        payload.putArray("logs").addObject().put("qrCode", qr).put("checkedAt", "2026-07-21T14:20:00Z");
        return post(STAFF + "/" + performance + "/sync").contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString());
    }

    private MockHttpServletRequestBuilder service(MockHttpServletRequestBuilder request, ObjectNode body)
            throws Exception {
        return request.header("X-Service-Token", TOKEN).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body));
    }

    private MockHttpServletRequestBuilder actor(
            MockHttpServletRequestBuilder request, UUID org, UUID actor, String role) {
        return request.header(HttpHeaders.AUTHORIZATION, "Bearer " + actor)
                .header(ORG_HEADER, org)
                .with(authentication(new UsernamePasswordAuthenticationToken(
                        actor.toString(), null, List.of(new SimpleGrantedAuthority("ROLE_" + role)))));
    }

    @TestConfiguration
    static class StubIdentityConfiguration {
        @Bean IdentityHttp identityHttp() {
            return new IdentityHttp();
        }

        @Bean @Primary RestClient fixtureIdentityClient(IdentityHttp identity) {
            return identity.client;
        }
    }

    static class IdentityHttp {
        private static final String ACCESS =
                "http://identity-test.invalid/internal/split/v1/organization-access/";
        private final RestClient client;
        private final Map<UUID, Map<UUID, String>> grantsByOrganization = new ConcurrentHashMap<>();

        IdentityHttp() {
            var builder = RestClient.builder();
            var mock = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
            mock.expect(ExpectedCount.manyTimes(), requestTo(startsWith(ACCESS))).andRespond(request -> {
                UUID organization = UUID.fromString(request.getURI().toString().substring(ACCESS.length()));
                String authorization = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
                UUID account = UUID.fromString(authorization.substring("Bearer ".length()));
                String grant = grantsByOrganization.getOrDefault(organization, Map.of()).get(account);
                if (grant == null) return withStatus(HttpStatus.FORBIDDEN).createResponse(request);
                String payload = """
                        {"accountId":"%s","organizationId":"%s","grants":["%s"]}
                        """.formatted(account, organization, grant);
                return withSuccess(payload, MediaType.APPLICATION_JSON).createResponse(request);
            });
            mock.expect(ExpectedCount.manyTimes(), requestTo("http://ticketing:8080/internal/split/admissions"))
                    .andRespond(withStatus(HttpStatus.NO_CONTENT));
            client = builder.build();
        }

        void allow(UUID org, UUID manager, String managerGrant, UUID staff, String staffGrant) {
            grantsByOrganization.put(org, Map.of(manager, managerGrant, staff, staffGrant));
        }
    }
}
