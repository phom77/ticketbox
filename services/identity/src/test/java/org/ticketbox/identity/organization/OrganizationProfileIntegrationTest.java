package org.ticketbox.identity.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.identity.IdentityApplication;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.organization.application.port.OrganizationImageStorage;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;

@Testcontainers
@SpringBootTest(classes = IdentityApplication.class)
@AutoConfigureMockMvc
class OrganizationProfileIntegrationTest {
    private static final String SERVICE_TOKEN = "identity-integration-fixture-service-token";

    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
        registry.add("ticketbox.security.jwt.secret",
                () -> "identity-integration-fixture-secret-at-least-sixty-four-characters");
        registry.add("split.token", () -> SERVICE_TOKEN);
    }

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private JdbcTemplate jdbc;
    @MockBean private OrganizationImageStorage images;

    @Test
    void anOrganizationWithoutAProfileHasDefaultsAndExposesItsTimezoneToServices() throws Exception {
        var org = organization();
        String manager = member(org, "MEMBERS");
        mvc.perform(get("/api/organizations/{id}/profile", org.id()).header("Authorization", manager))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.reportingTimezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.data.version").value(0))
                .andExpect(jsonPath("$.data.canEditProfile").value(true))
                .andExpect(jsonPath("$.data.displayName").value(org.name()));
        mvc.perform(get("/internal/split/v1/organizations/{id}/profile", org.id()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/split/v1/organizations/{id}/profile", org.id()).header("X-Service-Token", SERVICE_TOKEN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value(org.name()))
                .andExpect(jsonPath("$.reportingTimezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.legalName").doesNotExist());
        mvc.perform(get("/internal/split/v1/organizations/{id}/profile", UUID.randomUUID())
                        .header("X-Service-Token", SERVICE_TOKEN)).andExpect(status().isNotFound());
        mvc.perform(get("/internal/split/v1/organization-access/{id}", org.id())
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", manager))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reportingTimezone").value("Asia/Ho_Chi_Minh"));
    }

    @Test
    void aManagerSavesTheProfileWithAVersionCheckAndAnAuditThatKeepsNoValues() throws Exception {
        var org = organization();
        String manager = member(org, "MEMBERS", "EVENTS");
        var body = Map.of("contactEmail", "desk@example.test", "contactPhone", "+84 28 1234 5678",
                "website", "https://example.test", "reportingTimezone", "Asia/Bangkok", "version", 0);
        mvc.perform(put("/api/organizations/{id}/profile", org.id()).header("Authorization", manager)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.reportingTimezone").value("Asia/Bangkok"));
        mvc.perform(get("/internal/split/v1/organization-access/{id}", org.id())
                        .header("X-Service-Token", SERVICE_TOKEN).header("Authorization", manager))
                .andExpect(jsonPath("$.reportingTimezone").value("Asia/Bangkok"));
        String audit = jdbc.queryForObject("""
                SELECT array_to_string(changed_fields, ',') || '|' || cardinality(grants) FROM organization_audit
                WHERE organization_id = ? AND action = 'PROFILE_UPDATED'
                """, String.class, org.id());
        assertThat(audit).isEqualTo("contactEmail,contactPhone,website,reportingTimezone|0");

        mvc.perform(put("/api/organizations/{id}/profile", org.id()).header("Authorization", manager)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.contactEmail").value("desk@example.test"));
    }

    @Test
    void aFinanceMemberEditsStatementDetailsButNotTheProfile() throws Exception {
        var org = organization();
        String finance = member(org, "FINANCE");
        mvc.perform(put("/api/organizations/{id}/profile/statement-details", org.id()).header("Authorization", finance)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "legalName", "Example Co., Ltd", "taxCode", "0312345678-001",
                                "billingAddress", "1 Example Street", "version", 0))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.taxCode").value("0312345678-001"))
                .andExpect(jsonPath("$.data.canEditProfile").value(false))
                .andExpect(jsonPath("$.data.canEditStatementDetails").value(true));
        mvc.perform(put("/api/organizations/{id}/profile", org.id()).header("Authorization", finance)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "reportingTimezone", "Asia/Bangkok", "version", 1))))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/organizations/{id}/profile/logo", org.id()).param("version", "1")
                        .header("Authorization", finance)).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT reporting_timezone FROM organization_profiles WHERE organization_id=?",
                String.class, org.id())).isEqualTo("Asia/Ho_Chi_Minh");
    }

    @Test
    void membersWithoutAnEditingGrantAreRefusedAndOutsidersSeeNotFound() throws Exception {
        var org = organization();
        String events = member(org, "EVENTS");
        mvc.perform(get("/api/organizations/{id}/profile", org.id()).header("Authorization", events))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.canEditProfile").value(false))
                .andExpect(jsonPath("$.data.canEditStatementDetails").value(false));
        mvc.perform(put("/api/organizations/{id}/profile/statement-details", org.id()).header("Authorization", events)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "legalName", "X", "version", 0)))).andExpect(status().isForbidden());
        var other = organization();
        String outsider = member(other, "MEMBERS");
        mvc.perform(get("/api/organizations/{id}/profile", org.id()).header("Authorization", outsider))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/organizations/{id}/profile", org.id()).header("Authorization", outsider)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "reportingTimezone", "Asia/Bangkok", "version", 0)))).andExpect(status().isNotFound());
    }

    @Test
    void invalidValuesAreRejectedPerField() throws Exception {
        var org = organization();
        String manager = member(org, "MEMBERS");
        mvc.perform(put("/api/organizations/{id}/profile", org.id()).header("Authorization", manager)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "contactEmail", "not-an-email", "website", "http://example.test",
                                "contactPhone", "call me", "reportingTimezone", "Mars/Olympus", "version", 0))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.contactEmail").exists())
                .andExpect(jsonPath("$.details.website").exists()).andExpect(jsonPath("$.details.contactPhone").exists())
                .andExpect(jsonPath("$.details.reportingTimezone").exists());
        mvc.perform(put("/api/organizations/{id}/profile/statement-details", org.id()).header("Authorization", manager)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of(
                                "taxCode", "12345", "version", 0))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.taxCode").exists());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM organization_profiles WHERE organization_id=?",
                Integer.class, org.id())).isZero();
    }

    @Test
    void replacingTheLogoDeletesTheOldImageAfterCommitAndAFailedUploadChangesNothing() throws Exception {
        var org = organization();
        String manager = member(org, "MEMBERS");
        when(images.uploadLogo(any(), any())).thenReturn(new OrganizationImageStorage.StoredImage(
                "https://res.cloudinary.com/demo/image/upload/v1/logo-1.png", "ticketbox/organization-logos/logo-1"));
        mvc.perform(logo(org, manager, png(128), 0)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.logoUrl").value("https://res.cloudinary.com/demo/image/upload/v1/logo-1.png"))
                .andExpect(jsonPath("$.data.version").value(1));
        verify(images, never()).deleteBestEffort(anyString());

        when(images.uploadLogo(any(), any())).thenReturn(new OrganizationImageStorage.StoredImage(
                "https://res.cloudinary.com/demo/image/upload/v1/logo-2.png", "ticketbox/organization-logos/logo-2"));
        mvc.perform(logo(org, manager, png(200), 1)).andExpect(status().isOk());
        verify(images).deleteBestEffort("ticketbox/organization-logos/logo-1");

        when(images.uploadLogo(any(), any())).thenThrow(
                new AppException(ErrorCode.IMAGE_STORAGE_UNAVAILABLE, "error.logo.storage-unavailable"));
        mvc.perform(logo(org, manager, png(200), 2)).andExpect(status().isServiceUnavailable());
        mvc.perform(logo(org, manager, png(64), 2)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/organizations/{id}/profile", org.id()).header("Authorization", manager))
                .andExpect(jsonPath("$.data.version").value(2))
                .andExpect(jsonPath("$.data.logoUrl").value("https://res.cloudinary.com/demo/image/upload/v1/logo-2.png"));

        mvc.perform(delete("/api/organizations/{id}/profile/logo", org.id()).param("version", "2")
                        .header("Authorization", manager)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.logoUrl").doesNotExist());
        verify(images).deleteBestEffort("ticketbox/organization-logos/logo-2");
    }

    @Test
    void approvalSeedsTheContactEmailOnce() {
        var org = organization();
        jdbc.update("INSERT INTO organization_profiles (organization_id, contact_email) VALUES (?, 'apply@example.test')",
                org.id());
        var profile = jdbc.queryForMap("SELECT contact_email, version, reporting_timezone FROM organization_profiles"
                + " WHERE organization_id = ?", org.id());
        assertThat(profile).containsEntry("contact_email", "apply@example.test").containsEntry("version", 0L)
                .containsEntry("reporting_timezone", "Asia/Ho_Chi_Minh");
    }

    private org.springframework.test.web.servlet.RequestBuilder logo(Org org, String token, byte[] bytes, long version) {
        return multipart(HttpMethod.PUT, "/api/organizations/{id}/profile/logo", org.id())
                .file(new MockMultipartFile("file", "logo.png", "image/png", bytes))
                .param("version", Long.toString(version)).header("Authorization", token);
    }

    private static byte[] png(int side) throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(side, side, BufferedImage.TYPE_INT_RGB), "png", out);
        return out.toByteArray();
    }

    record Org(UUID id, String name) {}

    private Org organization() {
        var id = UUID.randomUUID();
        var name = "Profile org " + id;
        var owner = register();
        jdbc.update("INSERT INTO organizations(id,name,initial_manager_id) VALUES (?,?,?)", id, name, owner);
        return new Org(id, name);
    }

    private UUID register() {
        String email = "profile-owner-" + UUID.randomUUID() + "@example.test";
        jdbc.update("""
                INSERT INTO users (id, email, full_name, password_hash, role, is_active, created_at, updated_at)
                SELECT gen_random_uuid(), ?, 'Owner', password_hash, 'ORGANIZER', true, now(), now()
                FROM users WHERE email = 'organizer@ticketbox.com'
                """, email);
        return jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
    }

    private String member(Org org, String... grants) throws Exception {
        String email = "profile-member-" + UUID.randomUUID() + "@example.test";
        jdbc.update("""
                INSERT INTO users (id, email, full_name, password_hash, role, is_active, created_at, updated_at)
                SELECT gen_random_uuid(), ?, 'Member', password_hash, 'ORGANIZER', true, now(), now()
                FROM users WHERE email = 'organizer@ticketbox.com'
                """, email);
        UUID account = jdbc.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
        jdbc.update("INSERT INTO organization_members(organization_id,account_id,grants) VALUES (?,?,string_to_array(?, ','))",
                org.id(), account, String.join(",", grants));
        var response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", "password123"))))
                .andExpect(status().isOk()).andReturn().getResponse();
        return "Bearer " + json.readTree(response.getContentAsString()).path("data").path("accessToken").asText();
    }
}
