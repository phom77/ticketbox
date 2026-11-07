package org.ticketbox.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
