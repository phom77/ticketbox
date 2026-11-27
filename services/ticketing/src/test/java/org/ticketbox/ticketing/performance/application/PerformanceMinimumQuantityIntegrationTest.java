package org.ticketbox.ticketing.performance.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.performance.application.PerformanceHolds.Pick;
import org.ticketbox.ticketing.performance.application.port.PerformanceCatalog;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock.Scope;
import org.ticketbox.ticketing.performance.domain.PerformanceSale;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Group;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Kind;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Offer;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Seat;
import org.ticketbox.ticketing.queue.application.WaitingRoomService;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
            "spring.datasource.hikari.data-source-properties.socketTimeout=5",
            "split.token=ticketing-test-split-token-at-least-32-chars",
            "ticketbox.payments.service-token=ticketing-test-payment-token-at-least-32-chars",
            "ticketbox.notifications.service-token=ticketing-test-notification-token-at-least-32-chars",
            "ticketbox.payments.dispatch-interval-ms=3600000",
            "ticketbox.events.recovery-interval-ms=3600000",
            "split.ticket-interval-ms=3600000",
            "ticketbox.orders.expiration.fixed-delay-ms=3600000",
            "ticketbox.holds.cleanup-interval-ms=3600000",
            "spring.rabbitmq.listener.simple.auto-startup=false",
            "ticketbox.queue.admission-capacity=100",
            "ticketbox.queue.global-admission-capacity=1000",
            "ticketbox.queue.admission-rate=10000",
            "ticketbox.queue.admission-burst=10000",
            "ticketbox.queue.global-admission-rate=10000",
            "ticketbox.queue.global-admission-burst=10000",
            "ticketbox.security.jwt.secret=phase1-test-fixture-secret-with-at-least-sixty-four-characters-local-only"
        })
@Testcontainers
class PerformanceMinimumQuantityIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    @Container
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3-management");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("spring.flyway.user", postgres::getUsername);
        registry.add("spring.flyway.password", postgres::getPassword);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getFirstMappedPort());
        registry.add("spring.rabbitmq.host", rabbit::getHost);
        registry.add("spring.rabbitmq.port", rabbit::getAmqpPort);
        registry.add("spring.rabbitmq.username", rabbit::getAdminUsername);
        registry.add("spring.rabbitmq.password", rabbit::getAdminPassword);
    }

    @Autowired PerformanceCatalog catalog;
    @Autowired PerformanceHolds holds;
    @Autowired WaitingRoomService waitingRoom;
    @Autowired JdbcTemplate jdbc;

    private record Fixture(PerformanceSale sale, UUID gaOffer, UUID seatOffer, List<UUID> seats) {}

    private Fixture fixture(int gaMinimum) {
        var now = OffsetDateTime.now().withNano(0);
        var pool = new Group(UUID.randomUUID(), UUID.randomUUID(), "Floor", 10, Kind.GA, List.of());
        var seats = List.of(new Seat(UUID.randomUUID(), "A", "1", false), new Seat(UUID.randomUUID(), "A", "2", false),
                new Seat(UUID.randomUUID(), "A", "3", false));
        var stand = new Group(UUID.randomUUID(), UUID.randomUUID(), "Stand", 3, Kind.ASSIGNED, seats);
        var gaOffer = offer(pool, "Pair", gaMinimum, now);
        var seatOffer = offer(stand, "Stand pair", 2, now);
        var sale = sale(now, 1, List.of(pool, stand), List.of(gaOffer, seatOffer));
        catalog.apply(sale);
        return new Fixture(sale, gaOffer.id(), seatOffer.id(), seats.stream().map(Seat::id).toList());
    }

    private static Offer offer(Group group, String name, int minimum, OffsetDateTime now) {
        return new Offer(UUID.randomUUID(), group.id(), name, BigDecimal.valueOf(100_000), "VND",
                now.minusDays(1), now.plusDays(1), true, "Perks", minimum);
    }

    private static PerformanceSale sale(OffsetDateTime now, long version, List<Group> groups, List<Offer> offers) {
        return new PerformanceSale(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                null, version, 1L, "a".repeat(64), "Pair show", "Venue", now.plusDays(2), now.plusDays(2).plusHours(2),
                null, "Asia/Ho_Chi_Minh", now.minusDays(1), now.plusDays(1), "ON_SALE", false, true, null, 6,
                groups, offers);
    }

    private String admit(Scope buyer) {
        waitingRoom.join(buyer.performanceId(), buyer.userId());
        waitingRoom.promoteWaitingUsers(buyer.performanceId());
        return waitingRoom.status(buyer.performanceId(), buyer.userId()).queueAccessToken();
    }

    private List<Object> state(UUID performance) {
        return List.of(
                jdbc.queryForList("SELECT id,available,held,allocated FROM performance_groups WHERE performance_id=? ORDER BY id",
                        performance).toString(),
                jdbc.queryForList("SELECT id,status FROM performance_seats WHERE performance_id=? ORDER BY id",
                        performance).toString(),
                jdbc.queryForObject("SELECT count(*) FROM performance_hold_items WHERE performance_id=?", Integer.class,
                        performance));
    }

    private void assertRefused(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(AppException.class, error -> {
            assertThat(error.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST);
            assertThat(error.getMessage()).isEqualTo("error.performance.offer-min-quantity");
            assertThat(error.messageArguments()).hasSize(2).contains(2);
        });
    }

    @Test
    void gaQuantityBelowMinimumIsRefusedWithoutTouchingStockOrHold() {
        var f = fixture(2);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var before = state(f.sale().id());
        assertRefused(() -> holds.replace(buyer, token, "one", 1L, 0, List.of(new Pick(f.gaOffer(), null, 1))));
        assertThat(state(f.sale().id())).isEqualTo(before);
        // The same refused request is refused the same way when replayed.
        assertRefused(() -> holds.replace(buyer, token, "one", 1L, 0, List.of(new Pick(f.gaOffer(), null, 1))));
        assertThat(state(f.sale().id())).isEqualTo(before);

        var hold = holds.replace(buyer, token, "two", 1L, 0, List.of(new Pick(f.gaOffer(), null, 2)));
        assertThat(hold.items()).singleElement().satisfies(line -> assertThat(line.quantity()).isEqualTo(2));
        var held = state(f.sale().id());
        assertRefused(() -> holds.replace(buyer, token, "down", 1L, hold.version(),
                List.of(new Pick(f.gaOffer(), null, 1))));
        assertThat(state(f.sale().id())).isEqualTo(held);
        assertThat(holds.current(buyer, token).items()).singleElement()
                .satisfies(line -> assertThat(line.quantity()).isEqualTo(2));
    }

    @Test
    void removingTheTicketTypeIsAlwaysAllowed() {
        var f = fixture(2);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var hold = holds.replace(buyer, token, "two", 1L, 0, List.of(new Pick(f.gaOffer(), null, 2)));
        var cleared = holds.replace(buyer, token, "none", 1L, hold.version(), List.of());
        assertThat(cleared.items()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT available FROM performance_groups WHERE performance_id=? AND kind='GA'",
                Integer.class, f.sale().id())).isEqualTo(10);
    }

    @Test
    void seatedTicketTypeNeedsTheMinimumNumberOfSeats() {
        var f = fixture(1);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var before = state(f.sale().id());
        assertRefused(() -> holds.replace(buyer, token, "seat", 1L, 0,
                List.of(new Pick(f.seatOffer(), f.seats().get(0), null))));
        assertThat(state(f.sale().id())).isEqualTo(before);
        var hold = holds.replace(buyer, token, "seats", 1L, 0, List.of(
                new Pick(f.seatOffer(), f.seats().get(0), null), new Pick(f.seatOffer(), f.seats().get(1), null)));
        assertThat(hold.items()).hasSize(2);
    }

    @Test
    void existingHoldSurvivesAnIncreasedMinimumUntilItsQuantityChanges() {
        var f = fixture(1);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var hold = holds.replace(buyer, token, "one", 1L, 0, List.of(new Pick(f.gaOffer(), null, 1)));

        var raised = f.sale().offers().getFirst();
        var stricter = new Offer(raised.id(), raised.groupId(), raised.name(), raised.price(), "VND",
                raised.saleStartAt(), raised.saleEndAt(), true, "Perks", 2);
        var next = new PerformanceSale(f.sale().id(), f.sale().eventId(), f.sale().organizationId(), null, 2, 1L,
                "a".repeat(64), f.sale().title(), f.sale().venueName(), f.sale().startsAt(), f.sale().endsAt(), null,
                f.sale().timezone(), f.sale().saleStartAt(), f.sale().saleEndAt(), "ON_SALE", false, true, null, 6,
                f.sale().groups(), List.of(stricter, f.sale().offers().getLast()));
        catalog.apply(next);

        // The unchanged line is kept while another ticket type is added.
        var kept = holds.replace(buyer, token, "add", 1L, hold.version(), List.of(
                new Pick(f.gaOffer(), null, 1),
                new Pick(f.seatOffer(), f.seats().get(0), null), new Pick(f.seatOffer(), f.seats().get(1), null)));
        assertThat(kept.items()).hasSize(3);
        // Changing the quantity of that ticket type must meet the new minimum.
        var seated = List.of(new Pick(f.seatOffer(), f.seats().get(0), null),
                new Pick(f.seatOffer(), f.seats().get(1), null));
        var two = holds.replace(buyer, token, "two", 1L, kept.version(), java.util.stream.Stream.concat(
                List.of(new Pick(f.gaOffer(), null, 2)).stream(), seated.stream()).toList());
        assertRefused(() -> holds.replace(buyer, token, "back", 1L, two.version(), java.util.stream.Stream.concat(
                List.of(new Pick(f.gaOffer(), null, 1)).stream(), seated.stream()).toList()));
    }

    private void raiseSeatMinimum(Fixture f, int minimum) {
        var seat = f.sale().offers().getLast();
        var stricter = new Offer(seat.id(), seat.groupId(), seat.name(), seat.price(), "VND", seat.saleStartAt(),
                seat.saleEndAt(), true, "Perks", minimum);
        catalog.apply(new PerformanceSale(f.sale().id(), f.sale().eventId(), f.sale().organizationId(), null, 2, 1L,
                "a".repeat(64), f.sale().title(), f.sale().venueName(), f.sale().startsAt(), f.sale().endsAt(), null,
                f.sale().timezone(), f.sale().saleStartAt(), f.sale().saleEndAt(), "ON_SALE", false, true, null, 6,
                f.sale().groups(), List.of(f.sale().offers().getFirst(), stricter)));
    }

    private void assertMinimumRefused(Runnable action, int minimum) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(AppException.class, error -> {
            assertThat(error.getMessage()).isEqualTo("error.performance.offer-min-quantity");
            assertThat(error.messageArguments()).contains(minimum);
        });
    }

    @Test
    void seatSwapBelowARaisedMinimumIsRefusedButResendingTheSameSeatsIsKept() {
        var f = fixture(1);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var both = List.of(new Pick(f.seatOffer(), f.seats().get(0), null),
                new Pick(f.seatOffer(), f.seats().get(1), null));
        var hold = holds.replace(buyer, token, "two", 1L, 0, both);
        raiseSeatMinimum(f, 3);

        var before = state(f.sale().id());
        var swapped = List.of(new Pick(f.seatOffer(), f.seats().get(0), null),
                new Pick(f.seatOffer(), f.seats().get(2), null));
        assertMinimumRefused(() -> holds.replace(buyer, token, "swap", 1L, hold.version(), swapped), 3);
        assertThat(state(f.sale().id())).isEqualTo(before);
        assertThat(holds.replace(buyer, token, "same", 1L, hold.version(), both).items()).hasSize(2);
    }

    @Test
    void theExemptionDoesNotApplyOnceTheHoldHasExpired() {
        var f = fixture(1);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var both = List.of(new Pick(f.seatOffer(), f.seats().get(0), null),
                new Pick(f.seatOffer(), f.seats().get(1), null));
        var hold = holds.replace(buyer, token, "two", 1L, 0, both);
        raiseSeatMinimum(f, 3);
        jdbc.update("UPDATE performance_holds SET expires_at = now() - interval '1 minute' WHERE performance_id=?",
                f.sale().id());
        assertMinimumRefused(() -> holds.replace(buyer, token, "again", 1L, hold.version(), both), 3);
    }

    @Test
    void inactiveTicketTypeReportsUnavailableBeforeTheMinimum() {
        var f = fixture(1);
        var buyer = new Scope(f.sale().id(), UUID.randomUUID());
        String token = admit(buyer);
        var seat = f.sale().offers().getLast();
        var inactive = new Offer(seat.id(), seat.groupId(), seat.name(), seat.price(), "VND", seat.saleStartAt(),
                seat.saleEndAt(), false, "Perks", 2);
        catalog.apply(new PerformanceSale(f.sale().id(), f.sale().eventId(), f.sale().organizationId(), null, 2, 1L,
                "a".repeat(64), f.sale().title(), f.sale().venueName(), f.sale().startsAt(), f.sale().endsAt(), null,
                f.sale().timezone(), f.sale().saleStartAt(), f.sale().saleEndAt(), "ON_SALE", false, true, null, 6,
                f.sale().groups(), List.of(f.sale().offers().getFirst(), inactive)));
        assertThatThrownBy(() -> holds.replace(buyer, token, "one", 1L, 0,
                List.of(new Pick(f.seatOffer(), f.seats().get(0), null))))
                .isInstanceOfSatisfying(AppException.class, error ->
                        assertThat(error.getMessage()).isEqualTo("error.performance.offer-unavailable"));
    }
}
