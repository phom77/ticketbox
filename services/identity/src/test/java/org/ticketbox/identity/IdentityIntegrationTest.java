package org.ticketbox.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@Testcontainers
@SpringBootTest(classes = IdentityApplication.class)
@AutoConfigureMockMvc
class IdentityIntegrationTest {
    private static final String JWT_SECRET =
            "identity-integration-fixture-secret-at-least-sixty-four-characters";
    private static final String SERVICE_TOKEN = "identity-integration-fixture-service-token";

    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
        registry.add("ticketbox.security.jwt.secret", () -> JWT_SECRET);
        registry.add("split.token", () -> SERVICE_TOKEN);
        registry.add("ticketbox.reset.key", () -> "identity-test-only-reset-key-with-adequate-length");
    }

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void seededAccountCanLogInAndJwtKeepsAllClaims() throws Exception {
        var response =
                mvc.perform(
                                post("/api/auth/login")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(
                                                """
{"email":"admin@ticketbox.com","password":"password123"}
"""))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse();
        String jwt =
                json.readTree(response.getContentAsString())
                        .path("data")
                        .path("accessToken")
                        .asText();
        var claims =
                Jwts.parser()
                        .verifyWith(Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8)))
                        .build()
                        .parseSignedClaims(jwt)
                        .getPayload();
        assertThat(claims.getSubject())
                .isEqualTo(
                        jdbc.queryForObject(
                                        "SELECT id FROM users WHERE email = 'admin@ticketbox.com'",
                                        UUID.class)
                                .toString());
        assertThat(claims.get("email")).isEqualTo("admin@ticketbox.com");
        assertThat(claims.get("role")).isEqualTo("ADMIN");
        assertThat(claims.get("fullName"))
                .isEqualTo(
                        jdbc.queryForObject(
                                "SELECT full_name FROM users WHERE email = 'admin@ticketbox.com'",
                                String.class));
        mvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk());
    }

    @Test
    void serviceTokenGrantsContactLookupWithTheExistingPayload() throws Exception {
        UUID id =
                jdbc.queryForObject(
                        "SELECT id FROM users WHERE email = 'admin@ticketbox.com'", UUID.class);
        String name =
                jdbc.queryForObject("SELECT full_name FROM users WHERE id = ?", String.class, id);
        mvc.perform(get("/internal/split/users/{id}", id).header("X-Service-Token", SERVICE_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.email").value("admin@ticketbox.com"))
                .andExpect(jsonPath("$.fullName").value(name))
                .andExpect(jsonPath("$.data").doesNotExist());
        mvc.perform(
                        get("/internal/split/users/{id}", UUID.randomUUID())
                                .header("X-Service-Token", SERVICE_TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Request rejected"));
    }

    @Test
    void supportEmailLookupIsInternalAndNormalizesTheAddress() throws Exception {
        String body = "{\"email\":\" Audience@TicketBox.com \"}";
        mvc.perform(post("/internal/split/users/lookup").contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/split/users/lookup").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Service-Token", SERVICE_TOKEN).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("00000000-0000-0000-0000-000000000003"))
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void passwordResetRequestsReturnUniformAcceptance() throws Exception {
        for (String email : java.util.List.of("audience@ticketbox.com", "admin@ticketbox.com", "missing@example.test")) {
            mvc.perform(post("/api/auth/password-reset").contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(java.util.Map.of("email", email))))
                    .andExpect(status().isAccepted())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(""));
        }
        jdbc.update("DELETE FROM password_resets WHERE account_id=(SELECT id FROM users WHERE email='audience@ticketbox.com')");
    }

    @Test
    void onlyLatestResetLinkCanBeConsumedOnceAndOldSessionStopsWorking() throws Exception {
        String email = "reset-" + UUID.randomUUID() + "@example.test";
        String password = "existing-password";
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("email", email, "password", password, "fullName", "Fixture"))))
                .andExpect(status().isCreated());
        String loginBody = json.writeValueAsString(java.util.Map.of("email", email, "password", password));
        var login = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody))
                .andExpect(status().isOk()).andReturn().getResponse();
        String oldSession = json.readTree(login.getContentAsString()).path("data").path("accessToken").asText();
        String resetBody = json.writeValueAsString(java.util.Map.of("email", email));
        String first = issueReset(resetBody);
        String latest = issueReset(resetBody);
        String nextPassword = "replacement-password";
        assertThat(confirmReset(first, nextPassword)).isEqualTo(400);

        try (var pool = Executors.newFixedThreadPool(2)) {
            var firstUse = pool.submit(() -> confirmReset(latest, nextPassword));
            var secondUse = pool.submit(() -> confirmReset(latest, nextPassword));
            assertThat(java.util.List.of(firstUse.get(10, TimeUnit.SECONDS), secondUse.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(204, 400);
        }
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + oldSession))
                .andExpect(status().isUnauthorized());
        String expired = issueReset(resetBody);
        jdbc.update("UPDATE password_resets SET expires_at=clock_timestamp() WHERE account_id=(SELECT id FROM users WHERE email=?)", email);
        assertThat(confirmReset(expired, "password-after-expiry")).isEqualTo(400);
    }

    private String issueReset(String body) throws Exception {
        mvc.perform(post("/api/auth/password-reset").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());
        var claimed = mvc.perform(post("/internal/split/password-reset/mail/claim").header("X-Service-Token", SERVICE_TOKEN))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readTree(claimed.getContentAsString()).path("token").asText();
    }

    private int confirmReset(String token, String password) throws Exception {
        return mvc.perform(post("/api/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(java.util.Map.of("token", token, "password", password))))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void invalidServiceTokenIsRejectedBeforeContactLookup() throws Exception {
        mvc.perform(
                        get("/internal/split/users/{id}", UUID.randomUUID())
                                .header("X-Service-Token", "invalid"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void malformedBearerIsRejectedWithThePublicErrorEnvelope() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Vui lòng đăng nhập để tiếp tục"));
    }

    @Test
    void organizationGrantsAreBoundToTheAccountAndCurrentMembership() throws Exception {
        UUID organizer = accountId("organizer@ticketbox.com");
        UUID buyer = accountId("audience@ticketbox.com");
        String adminToken = login("admin@ticketbox.com");
        String organizerToken = login("organizer@ticketbox.com");
        String buyerToken = login("audience@ticketbox.com");

        UUID first = createOrganization(adminToken, "Scope test A", organizer);
        UUID second = createOrganization(adminToken, "Scope test B", organizer);
        assertThat(createOrganization(adminToken, "Scope test A", organizer)).isEqualTo(first);
        var invitation = mvc.perform(post("/api/organizations/{id}/invitations", first)
                        .header("Authorization", organizerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of(
                                "accountId", buyer, "grants", java.util.List.of("FINANCE")))))
                .andExpect(status().isCreated()).andReturn().getResponse();
        String code = json.readTree(invitation.getContentAsString()).path("data").path("code").asText();
        String accept = json.writeValueAsString(java.util.Map.of("code", code));

        mvc.perform(post("/api/organizations/invitations/accept").header("Authorization", organizerToken)
                        .contentType(MediaType.APPLICATION_JSON).content(accept))
                .andExpect(status().isNotFound());
        try (var callers = Executors.newFixedThreadPool(2)) {
            var firstAccept = callers.submit(() -> acceptInvitation(buyerToken, accept));
            var secondAccept = callers.submit(() -> acceptInvitation(buyerToken, accept));
            assertThat(firstAccept.get(10, TimeUnit.SECONDS)).isEqualTo(200);
            assertThat(secondAccept.get(10, TimeUnit.SECONDS)).isEqualTo(200);
        }
        mvc.perform(get("/internal/split/v1/organization-access/{id}", first)
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", buyerToken))
                .andExpect(status().isOk()).andExpect(jsonPath("$.grants[0]").value("FINANCE"));
        mvc.perform(get("/internal/split/v1/organization-access/{id}", second)
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", buyerToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/internal/split/v1/organization-access/{id}", first)
                        .header("Authorization", buyerToken))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/organizations/{id}/members/{accountId}", first, organizer)
                        .header("Authorization", organizerToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"grants\":[]}"))
                .andExpect(status().isConflict());
        setActive(adminToken, buyer, false);
        try {
            mvc.perform(get("/internal/split/v1/organization-access/{id}", first)
                            .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", buyerToken))
                    .andExpect(status().isUnauthorized());
        } finally {
            setActive(adminToken, buyer, true);
        }
        mvc.perform(get("/internal/split/v1/organization-access/{id}", first)
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", buyerToken))
                .andExpect(status().isUnauthorized());
        String renewed = login("audience@ticketbox.com");
        mvc.perform(get("/internal/split/v1/organization-access/{id}", first)
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", renewed))
                .andExpect(status().isOk());
        mvc.perform(put("/api/organizations/{id}/members/{accountId}", first, buyer)
                        .header("Authorization", organizerToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"grants\":[]}"))
                .andExpect(status().isOk());
        mvc.perform(get("/internal/split/v1/organization-access/{id}", first)
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", renewed))
                .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("""
                        SELECT count(*) FROM organization_audit
                        WHERE organization_id = ? AND action = 'INVITATION_ACCEPTED'
                        """, Integer.class, first)).isEqualTo(1);
    }

    private void setActive(String admin, UUID account, boolean active) throws Exception {
        mvc.perform(put("/api/admin/users/{id}/status", account).header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"isActive\":" + active + "}"))
                .andExpect(status().isOk());
    }

    private int acceptInvitation(String token, String body) throws Exception {
        return mvc.perform(post("/api/organizations/invitations/accept").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void platformCanRecoverAnOrganizationWithNoActiveManager() throws Exception {
        UUID organizer = accountId("organizer@ticketbox.com");
        UUID replacement = accountId("audience@ticketbox.com");
        String admin = login("admin@ticketbox.com");
        UUID organization = createOrganization(admin, "Recovery fixture", organizer);
        String body = json.writeValueAsString(java.util.Map.of("accountId", replacement));

        mvc.perform(put("/api/admin/organizations/{id}/manager", organization)
                        .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
        setActive(admin, organizer, false);
        try {
            mvc.perform(put("/api/admin/organizations/{id}/manager", organization)
                            .header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk());
            mvc.perform(get("/api/organizations/{id}/members", organization)
                            .header("Authorization", login("audience@ticketbox.com")))
                    .andExpect(status().isOk());
        } finally {
            setActive(admin, organizer, true);
        }
    }

    private UUID createOrganization(String token, String name, UUID manager) throws Exception {
        var response = mvc.perform(post("/api/admin/organizations")
                        .header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of(
                                "name", name, "initialManagerId", manager))))
                .andExpect(status().isCreated()).andReturn().getResponse();
        return UUID.fromString(json.readTree(response.getContentAsString()).path("data").path("id").asText());
    }

    private UUID accountId(String email) {
        return jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
    }

    private String login(String email) throws Exception {
        var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("email", email, "password", "password123"))))
                .andExpect(status().isOk()).andReturn().getResponse();
        return "Bearer " + json.readTree(response.getContentAsString()).path("data").path("accessToken").asText();
    }

    @Test
    void startupIsFencedWhileTheCutoverMarkerIsNotReady() {
        jdbc.update(
                "INSERT INTO split_cutover_marker (id, source_digest, ready) VALUES (1, 'fixture',"
                        + " false)");
        try {
            assertThatThrownBy(
                            () ->
                                    new SpringApplicationBuilder(IdentityApplication.class)
                                            .run(
                                                    "--server.port=0",
                                                    "--spring.datasource.url="
                                                            + POSTGRES.getJdbcUrl(),
                                                    "--spring.datasource.username="
                                                            + POSTGRES.getUsername(),
                                                    "--spring.datasource.password="
                                                            + POSTGRES.getPassword(),
                                                    "--spring.flyway.user="
                                                            + POSTGRES.getUsername(),
                                                    "--spring.flyway.password="
                                                            + POSTGRES.getPassword(),
                                                    "--ticketbox.security.jwt.secret=" + JWT_SECRET,
                                                    "--split.token=" + SERVICE_TOKEN)
                                            .close())
                    .hasRootCauseMessage(
                            "Service data cutover is incomplete; consult the migration manifest");
        } finally {
            jdbc.update("DELETE FROM split_cutover_marker WHERE id = 1");
        }
    }
}
