package org.ticketbox.ticketing.integration.checkin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.infrastructure.integration.checkin.TicketPublisher;

@Testcontainers
class TicketPublisherIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void backfillRepublishesAPreviouslyDeliveredTicketWithItsReferenceAndType() {
        var dataSource = new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        Flyway.configure().dataSource(dataSource).target("15").load().migrate();
        var database = new JdbcTemplate(dataSource);
        UUID type = database.queryForObject("SELECT id FROM ticket_types ORDER BY id LIMIT 1", UUID.class);
        UUID concert = database.queryForObject("SELECT concert_id FROM ticket_types WHERE id=?", UUID.class, type);
        String name = database.queryForObject("SELECT name FROM ticket_types WHERE id=?", String.class, type);
        UUID buyer = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        UUID line = UUID.randomUUID();
        UUID ticket = UUID.randomUUID();
        database.update("""
                INSERT INTO orders(id,user_id,concert_id,total_amount,idempotency_key)
                VALUES(?,?,?,1,'fixture')
                """, order, buyer, concert);
        database.update("""
                INSERT INTO order_items(id,order_id,ticket_type_id,quantity,unit_price,subtotal)
                VALUES(?,?,?,1,1,1)
                """, line, order, type);
        database.update("""
                INSERT INTO tickets(id,order_item_id,ticket_type_id,concert_id,user_id,qr_code,qr_secret)
                VALUES(?,?,?,?,?,'fixture-qr','fixture-key')
                """, ticket, line, type, concert, buyer);
        database.update("UPDATE checkin_ticket_outbox SET delivered_version=version");

        Flyway.configure().dataSource(dataSource).load().migrate();
        String reference = database.queryForObject(
                "SELECT reference_code FROM tickets WHERE id=?", String.class, ticket);
        assertThat(reference).startsWith("VE-");
        assertThat(database.queryForObject(
                "SELECT version-delivered_version FROM checkin_ticket_outbox WHERE ticket_id=?",
                Long.class, ticket)).isEqualTo(1);
        database.update("UPDATE checkin_ticket_outbox SET delivered_version=version WHERE ticket_id<>?", ticket);

        var client = RestClient.builder();
        var http = MockRestServiceServer.bindTo(client).build();
        http.expect(requestTo("http://checkin.test/internal/split/tickets"))
                .andExpect(jsonPath("$.ticket.reference_code").value(reference))
                .andExpect(jsonPath("$.ticket.ticket_type_name").value(name))
                .andExpect(jsonPath("$.ticket.qr_code").value("fixture-qr"))
                .andRespond(withNoContent());
        new TicketPublisher(database, client.build(), new ObjectMapper(), "http://checkin.test").publish();

        http.verify();
        assertThat(database.queryForObject(
                "SELECT version-delivered_version FROM checkin_ticket_outbox WHERE ticket_id=?",
                Long.class, ticket)).isZero();
    }
}
