package org.ticketbox.catalog.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.catalog.sales.infrastructure.CatalogPublisher;

import java.util.UUID;

@Testcontainers
class CatalogPublisherIntegrationTest {
    private static final String TICKETING = "http://ticketing";
    private static final String CHECKIN = "http://checkin";
    private static final String PATH = "/internal/split/catalog";

    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    private static JdbcTemplate jdbc;
    private CatalogPublisher publisher;
    private MockRestServiceServer receivers;

    @BeforeAll
    static void migrateCatalog() {
        var dataSource =
                new DriverManagerDataSource(
                        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(dataSource).load().migrate();
        jdbc = new JdbcTemplate(dataSource);
    }

    @BeforeEach
    void configurePublisher() {
        jdbc.update(
                "UPDATE sale_config_outbox SET ticketing_version=version, checkin_version=version");
        RestClient.Builder http = RestClient.builder();
        receivers = MockRestServiceServer.bindTo(http).build();
        publisher =
                new CatalogPublisher(jdbc, http.build(), new ObjectMapper(), TICKETING, CHECKIN,
                        org.mockito.Mockito.mock(org.ticketbox.catalog.application.port.ReadCache.class));
    }

    @Test
    void publishesEveryBaselineFieldEvenWhenTheProducerSchemaAddsColumns() {
        UUID id = pendingConcert();
        String baseline =
                jdbc.queryForObject(
                        """
SELECT jsonb_build_object('id',o.concert_id,'version',o.version,'deleted',false,
  'concert',to_jsonb(c),'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
  FROM ticket_types t WHERE t.concert_id=o.concert_id))::text
FROM sale_config_outbox o JOIN concerts c ON c.id=o.concert_id WHERE o.concert_id=?
""",
                        String.class,
                        id);
        jdbc.execute("ALTER TABLE concerts ADD COLUMN local_concert_field text DEFAULT 'private'");
        jdbc.execute("ALTER TABLE ticket_types ADD COLUMN local_type_field text DEFAULT 'private'");
        try {
            receivers
                    .expect(requestTo(TICKETING + PATH))
                    .andExpect(method(POST))
                    .andExpect(content().json(baseline, true))
                    .andRespond(withSuccess().header("X-Catalog-Consumer", "ticketing"));
            receivers
                    .expect(requestTo(CHECKIN + PATH))
                    .andExpect(method(POST))
                    .andExpect(content().json(baseline, true))
                    .andRespond(withSuccess().header("X-Catalog-Consumer", "checkin"));
            publisher.publish();
            receivers.verify();
            assertThat(acknowledged(id, "ticketing_version")).isTrue();
            assertThat(acknowledged(id, "checkin_version")).isTrue();
        } finally {
            jdbc.execute("ALTER TABLE ticket_types DROP COLUMN local_type_field");
            jdbc.execute("ALTER TABLE concerts DROP COLUMN local_concert_field");
        }
    }

    @Test
    void publishesOrganizationOwnershipToBothProjections() {
        UUID concert = pendingConcert();
        UUID organization = UUID.randomUUID();
        try {
            jdbc.update("UPDATE concerts SET organization_id = ? WHERE id = ?", organization, concert);
            receivers.expect(requestTo(TICKETING + PATH))
                    .andExpect(jsonPath("$.concert.organization_id").value(organization.toString()))
                    .andRespond(withSuccess().header("X-Catalog-Consumer", "ticketing"));
            receivers.expect(requestTo(CHECKIN + PATH))
                    .andExpect(jsonPath("$.concert.organization_id").value(organization.toString()))
                    .andRespond(withSuccess().header("X-Catalog-Consumer", "checkin"));
            publisher.publish();
            receivers.verify();
            assertThat(acknowledged(concert, "ticketing_version")).isTrue();
            assertThat(acknowledged(concert, "checkin_version")).isTrue();
        } finally {
            jdbc.update("UPDATE concerts SET organization_id = NULL WHERE id = ?", concert);
        }
    }

    @Test
    void reportsSynchronousTicketingFailureAndRetriesOnlyTheUnacknowledgedConsumer() {
        UUID id = pendingConcert();
        receivers.expect(requestTo(TICKETING + PATH)).andRespond(withServerError());
        assertThatThrownBy(publisher::acknowledgeSales)
                .isInstanceOf(RestClientResponseException.class);
        assertThat(acknowledged(id, "ticketing_version")).isFalse();
        receivers.verify();
        receivers.reset();

        receivers.expect(requestTo(TICKETING + PATH)).andRespond(withServerError());
        receivers.expect(requestTo(CHECKIN + PATH)).andRespond(withSuccess().header("X-Catalog-Consumer", "checkin"));
        publisher.publish();
        receivers.verify();
        assertThat(acknowledged(id, "ticketing_version")).isFalse();
        assertThat(acknowledged(id, "checkin_version")).isTrue();
        receivers.reset();

        receivers.expect(requestTo(TICKETING + PATH)).andRespond(withSuccess().header("X-Catalog-Consumer", "ticketing"));
        publisher.publish();
        receivers.verify();
        assertThat(acknowledged(id, "ticketing_version")).isTrue();
    }

    @Test
    void activationVersionIsFixedAndAcknowledgedIndependently() {
        UUID id = pendingConcert();
        jdbc.update("UPDATE concerts SET status='DRAFT', organization_id=? WHERE id=?", UUID.randomUUID(), id);
        try {
            jdbc.update("UPDATE concerts SET status='ON_SALE' WHERE id=?", id);
            Long activation = jdbc.queryForObject(
                    "SELECT activation_version FROM sale_config_outbox WHERE concert_id=?", Long.class, id);
            assertThat(activation).isPositive();
            jdbc.update("UPDATE concerts SET updated_at=now() WHERE id=?", id);
            assertThat(jdbc.queryForObject(
                    "SELECT activation_version FROM sale_config_outbox WHERE concert_id=?", Long.class, id))
                    .isEqualTo(activation);
            receivers.expect(requestTo(TICKETING + PATH))
                    .andRespond(withSuccess().header("X-Catalog-Consumer", "checkin"));
            receivers.expect(requestTo(CHECKIN + PATH)).andRespond(withSuccess().header("X-Catalog-Consumer", "checkin"));
            publisher.publish();
            receivers.verify();
            assertThat(acknowledged(id, "ticketing_version")).isFalse();
            assertThat(acknowledged(id, "checkin_version")).isTrue();
        } finally {
            jdbc.update("UPDATE concerts SET status='ON_SALE', organization_id=NULL WHERE id=?", id);
        }
    }

    @Test
    void tombstoneRetainsNullConcertAndEmptyTypes() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sale_config_outbox(concert_id) VALUES (?)", id);
        String expected =
                """
                {"id":"%s","version":1,"deleted":true,"concert":null,"types":[]}
                """
                        .formatted(id);
        receivers
                .expect(requestTo(TICKETING + PATH))
                .andExpect(content().json(expected, true))
                .andRespond(withSuccess().header("X-Catalog-Consumer", "ticketing"));
        receivers
                .expect(requestTo(CHECKIN + PATH))
                .andExpect(content().json(expected, true))
                .andRespond(withSuccess().header("X-Catalog-Consumer", "checkin"));
        publisher.publish();
        receivers.verify();
    }

    private UUID pendingConcert() {
        UUID id =
                jdbc.queryForObject(
                        "SELECT concert_id FROM ticket_types ORDER BY id LIMIT 1", UUID.class);
        jdbc.update("UPDATE sale_config_outbox SET version=version+1 WHERE concert_id=?", id);
        return id;
    }

    private boolean acknowledged(UUID id, String consumerVersion) {
        return Boolean.TRUE.equals(
                jdbc.queryForObject(
                        "SELECT "
                                + consumerVersion
                                + "=version FROM sale_config_outbox WHERE concert_id=?",
                        Boolean.class,
                        id));
    }
}
