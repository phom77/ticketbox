package com.ticketbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.domain.TicketType;
import com.ticketbox.module.concert.domain.TicketTypeRepository;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.when;

/** Real HTTP/JWT, PostgreSQL/Flyway, Redis and RabbitMQ; only payment provider and SMTP are test doubles. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ticketbox.security.jwt.secret=journey-test-only-secret-with-at-least-sixty-four-characters-not-production",
        "ticketbox.payment.reconciliation-interval-ms=3600000",
        "ticketbox.queue.admission-capacity=10",
        "ticketbox.queue.global-admission-capacity=20",
        "ticketbox.queue.admission-rate=10",
        "ticketbox.queue.admission-burst=10",
        "ticketbox.queue.global-admission-rate=20",
        "ticketbox.queue.global-admission-burst=20",
        // Exercise duplicate payment requests without conflating this journey with rate-policy tests.
        "ticketbox.rate-limit.payment.capacity=8",
        "ticketbox.ai.provider=mock",
        "management.health.mail.enabled=false",
        "spring.batch.job.enabled=false",
        "spring.batch.jdbc.initialize-schema=always",
        "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.open-in-view=false"
})
@ActiveProfiles("test")
@Testcontainers
class PurchaseJourneyIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @Container static final GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    @Container static final RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3-management-alpine");

    @DynamicPropertySource
    static void infrastructure(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", postgres::getJdbcUrl);
        properties.add("spring.datasource.username", postgres::getUsername);
        properties.add("spring.datasource.password", postgres::getPassword);
        properties.add("spring.data.redis.host", redis::getHost);
        properties.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
        properties.add("spring.rabbitmq.host", rabbit::getHost);
        properties.add("spring.rabbitmq.port", rabbit::getAmqpPort);
        properties.add("spring.rabbitmq.username", rabbit::getAdminUsername);
        properties.add("spring.rabbitmq.password", rabbit::getAdminPassword);
    }

    @Autowired TestRestTemplate http;
    @Autowired com.ticketbox.module.inventory.InventoryPort inventory;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired ConcertRepository concerts;
    @Autowired TicketTypeRepository ticketTypes;
    @Autowired PasswordEncoder passwords;
    @MockBean JavaMailSender smtp;

    @Test
    void purchaseRetryNotificationAndDuplicateCheckinPreserveBusinessInvariants() {
        when(smtp.createMimeMessage()).thenAnswer(call -> new MimeMessage(Session.getInstance(new Properties())));
        String buyerEmail = "journey-" + UUID.randomUUID() + "@ticketbox.test";
        JsonNode buyer = request(HttpMethod.POST, "/api/auth/register", null, Map.of(
                "email", buyerEmail, "password", "JourneyPassword123", "fullName", "Journey Buyer"), 201);
        UUID buyerId = UUID.fromString(buyer.path("id").asText());
        String token = login(buyerEmail);
        User organizer = createUser(User.Role.ORGANIZER);
        User staff = createUser(User.Role.STAFF);
        Concert concert = new Concert();
        concert.setTitle("Isolated journey fixture");
        concert.setVenueName("Test venue"); concert.setVenueAddress("Test address");
        concert.setCreatedBy(organizer.getId()); concert.setStatus(Concert.Status.ON_SALE);
        concert.setEventDate(OffsetDateTime.now().plusDays(30));
        concert.setSaleStartAt(OffsetDateTime.now().minusHours(1));
        concert.setSaleEndAt(OffsetDateTime.now().plusDays(1));
        concert = concerts.saveAndFlush(concert);
        TicketType type = new TicketType();
        type.setConcertId(concert.getId()); type.setName("GA"); type.setPrice(BigDecimal.valueOf(250000));
        type.setTotalQuantity(3); type.setAvailableQty(3); type.setMaxPerAccount(2); type.setActive(true);
        type = ticketTypes.saveAndFlush(type);
        UUID concertId = concert.getId(), typeId = type.getId();

        request(HttpMethod.GET, "/api/concerts/" + concertId, null, null, 200);
        String queue = "/api/queue/concerts/" + concertId;
        request(HttpMethod.POST, queue + "/join", token, null, 200);
        await().atMost(Duration.ofSeconds(20)).pollInterval(Duration.ofSeconds(1)).until(() ->
                !request(HttpMethod.GET, queue + "/status", token, null, 200)
                        .path("queueAccessToken").asText("").isBlank());
        String access = request(HttpMethod.GET, queue + "/status", token, null, 200)
                .path("queueAccessToken").asText();
        HttpHeaders purchase = new HttpHeaders();
        purchase.set("Queue-Access-Token", access);
        purchase.set("Idempotency-Key", "journey-" + UUID.randomUUID());
        request(HttpMethod.POST, "/api/reservations/concerts/" + concertId + "/ticket-types/" + typeId + "/reserve",
                token, Map.of("quantity", 2), 200, purchase);
        Map<String, Object> basket = Map.of("concertId", concertId,
                "items", List.of(Map.of("ticketTypeId", typeId, "quantity", 2)));
        String orderId = request(HttpMethod.POST, "/api/orders", token, basket, 201, purchase).path("id").asText();
        request(HttpMethod.POST, "/api/orders", token, basket, 409, purchase);
        // Simulate the client losing the create response after commit. Recovery only
        // needs the original command key, even though the queue session is consumed.
        HttpHeaders recovery = new HttpHeaders();
        recovery.set("Idempotency-Key", purchase.getFirst("Idempotency-Key"));
        JsonNode recovered = request(HttpMethod.GET, "/api/orders/by-idempotency-key", token, null, 200, recovery);
        assertThat(recovered.path("id").asText()).isEqualTo(orderId);
        assertThat(recovered.path("items").get(0).path("quantity").asInt()).isEqualTo(2);
        request(HttpMethod.GET, "/api/orders/by-idempotency-key", null, null, 401, recovery);
        HttpHeaders missing = new HttpHeaders();
        missing.set("Idempotency-Key", "unknown-" + UUID.randomUUID());
        request(HttpMethod.GET, "/api/orders/by-idempotency-key", token, null, 404, missing);
        HttpHeaders invalid = new HttpHeaders();
        invalid.set("Idempotency-Key", "x".repeat(129));
        request(HttpMethod.GET, "/api/orders/by-idempotency-key", token, null, 400, invalid);
        String payment = "/api/payments/" + orderId;
        String attempt = request(HttpMethod.POST, payment + "/initiate", token, Map.of("provider", "MOCK"), 200)
                .path("attemptId").asText();
        assertThat(request(HttpMethod.POST, payment + "/initiate", token, Map.of("provider", "MOCK"), 200)
                .path("attemptId").asText()).isEqualTo(attempt).isNotBlank();
        request(HttpMethod.POST, "/api/mock-payments/" + orderId + "/success", token, null, 200);
        request(HttpMethod.POST, "/api/mock-payments/" + orderId + "/success", token, null, 200);
        assertThat(request(HttpMethod.GET, payment + "/status", token, null, 200).path("orderStatus").asText())
                .isEqualTo("PAID");
        JsonNode tickets = request(HttpMethod.GET, "/api/tickets", token, null, 200);
        assertThat(tickets.size()).isEqualTo(2);
        assertThat(tickets.get(0).path("qrCode").asText()).isNotBlank();
        assertThat(inventory.available(typeId)).isEqualTo(1);
        assertThat(count("select count(*) from orders where user_id=?", buyerId)).isEqualTo(1);
        assertThat(count("select count(*) from ticket_holds where user_id=?", buyerId)).isZero();
        assertThat(count("select count(*) from payment_attempts where order_id=?", UUID.fromString(orderId))).isEqualTo(1);
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            assertThat(count("select count(*) from notifications where user_id=? and channel='APP'", buyerId)).isEqualTo(1);
            assertThat(count("select count(*) from notifications where user_id=? and channel='EMAIL' and status='SENT'", buyerId))
                    .isEqualTo(1);
        });
        assertThat(request(HttpMethod.GET, "/api/notifications", token, null, 200).path("totalElements").asInt())
                .isEqualTo(2);

        User otherBuyer = createUser(User.Role.AUDIENCE);
        request(HttpMethod.GET, "/api/orders/by-idempotency-key", login(otherBuyer.getEmail()), null, 404, recovery);
        assertThat(request(HttpMethod.GET, "/api/orders/by-idempotency-key", token, null, 200, recovery)
                .path("status").asText()).isEqualTo("PAID");
        request(HttpMethod.GET, "/api/orders/" + orderId, login(otherBuyer.getEmail()), null, 404);
        Map<String, Object> scan = Map.of("concertId", concertId, "qrCode", tickets.get(0).path("qrCode").asText(),
                "deviceId", "journey-scanner", "gate", "A");
        request(HttpMethod.POST, "/api/staff/checkins/scan", token, scan, 403);
        String staffToken = login(staff.getEmail());
        assertThat(request(HttpMethod.POST, "/api/staff/checkins/scan", staffToken, scan, 200).path("status").asText())
                .isEqualTo("SUCCESS");
        assertThat(request(HttpMethod.POST, "/api/staff/checkins/scan", staffToken, scan, 200).path("status").asText())
                .isEqualTo("FAILED");
        assertThat(count("select count(*) from checkin_logs where concert_id=?", concertId)).isEqualTo(1);
        assertThat(count("select count(*) from tickets where concert_id=? and status='USED'", concertId)).isEqualTo(1);
    }

    private User createUser(User.Role role) {
        User user = new User(); user.setEmail("journey-" + UUID.randomUUID() + "@ticketbox.test");
        user.setFullName("Journey " + role); user.setPasswordHash(passwords.encode("JourneyPassword123"));
        user.setRole(role); user.setActive(true); return users.saveAndFlush(user);
    }

    private String login(String email) {
        return request(HttpMethod.POST, "/api/auth/login", null,
                Map.of("email", email, "password", "JourneyPassword123"), 200).path("accessToken").asText();
    }

    private long count(String sql, UUID id) { return jdbc.queryForObject(sql, Long.class, id); }

    private JsonNode request(HttpMethod method, String path, String token, Object body, int expected) {
        return request(method, path, token, body, expected, new HttpHeaders());
    }

    private JsonNode request(HttpMethod method, String path, String token, Object body, int expected, HttpHeaders extra) {
        HttpHeaders headers = new HttpHeaders(); headers.putAll(extra); headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) headers.setBearerAuth(token);
        ResponseEntity<JsonNode> response = http.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
        assertThat(response.getStatusCode().value()).as("%s %s", method, path).isEqualTo(expected);
        assertThat(response.getBody()).isNotNull();
        return response.getBody().path("data");
    }
}
