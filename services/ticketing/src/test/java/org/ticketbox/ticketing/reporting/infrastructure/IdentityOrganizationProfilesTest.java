package org.ticketbox.ticketing.reporting.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/** Consumer side of contracts/identity.organization-profile.v1.json, against a producer-shaped fixture. */
class IdentityOrganizationProfilesTest {
    private static final UUID ORGANIZATION = UUID.fromString("3f1c7b52-96a1-4c6b-9d5e-1f0d8a4a1b11");

    @Test
    void theFixtureCarriesEveryRequiredFieldOfTheContract() throws Exception {
        var mapper = new ObjectMapper();
        JsonNode contract = mapper.readTree(Files.readString(Path.of("../../contracts/identity.organization-profile.v1.json")));
        JsonNode fixture = mapper.readTree(getClass().getResourceAsStream("/contracts/identity.organization-profile.v1.example.json"));
        contract.get("required").forEach(field -> assertThat(fixture.has(field.asText())).as(field.asText()).isTrue());
        contract.get("properties").fieldNames().forEachRemaining(name -> assertThat(fixture.has(name)).as(name).isTrue());
    }

    @Test
    void readsTheProfileWithTheServiceTokenAndIgnoresFieldsItDoesNotKnow() throws Exception {
        byte[] body = getClass().getResourceAsStream("/contracts/identity.organization-profile.v1.example.json").readAllBytes();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var seen = new String[1];
        server.createContext("/internal/split/v1/organizations/", exchange -> {
            seen[0] = exchange.getRequestHeaders().getFirst("X-Service-Token");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            var client = RestClient.builder().defaultHeader("X-Service-Token", "token").build();
            var profile = new IdentityOrganizationProfiles(client, "http://127.0.0.1:" + server.getAddress().getPort())
                    .fetch(ORGANIZATION);
            assertThat(seen[0]).isEqualTo("token");
            assertThat(profile.legalName()).isEqualTo("Công ty TNHH Ánh Dương");
            assertThat(profile.taxCode()).isEqualTo("0312345678-001");
            assertThat(profile.logoPngUrl()).contains("f_png");
            assertThat(profile.reportingTimezone()).isEqualTo("Asia/Bangkok");
            assertThat(profile.version()).isEqualTo(4);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void unknownOrganizationAndUnreachableIdentityBothMeanUnavailable() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            exchange.sendResponseHeaders(404, -1);
            exchange.close();
        });
        server.start();
        int port = server.getAddress().getPort();
        try {
            var profiles = new IdentityOrganizationProfiles(RestClient.create(), "http://127.0.0.1:" + port);
            assertThatThrownBy(() -> profiles.fetch(ORGANIZATION)).isInstanceOfSatisfying(AppException.class,
                    e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.STATEMENT_PROFILE_UNAVAILABLE));
        } finally {
            server.stop(0);
        }
        var down = new IdentityOrganizationProfiles(RestClient.create(), "http://127.0.0.1:" + port);
        assertThatThrownBy(() -> down.fetch(ORGANIZATION)).isInstanceOf(AppException.class);
        assertThat(StandardCharsets.UTF_8).isNotNull();
    }
}
