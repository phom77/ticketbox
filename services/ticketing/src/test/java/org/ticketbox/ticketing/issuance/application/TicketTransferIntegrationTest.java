package org.ticketbox.ticketing.issuance.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
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
import org.ticketbox.ticketing.application.port.identity.UserContactPort;
import org.ticketbox.ticketing.application.port.identity.UserContactView;
import org.ticketbox.ticketing.domain.DomainViolation;
import org.ticketbox.ticketing.infrastructure.integration.payment.PaymentRemoteClient;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

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
            "ticketbox.transfers.expiry-delay-ms=3600000",
            "ticketbox.orders.expiration.fixed-delay-ms=3600000",
            "ticketbox.holds.cleanup-interval-ms=3600000",
            "spring.rabbitmq.listener.simple.auto-startup=false",
            "ticketbox.security.jwt.secret=phase1-test-fixture-secret-with-at-least-sixty-four-characters-local-only"
        })
@Testcontainers
class TicketTransferIntegrationTest {
    @Autowired private TicketTransferService transfers;
    @Autowired private JdbcTemplate jdbc;
    @MockBean private UserContactPort identity;
    @MockBean private PaymentRemoteClient payment;

    private final UUID sender = UUID.randomUUID();
    private final UUID friend = UUID.randomUUID();
    private final UUID staff = UUID.randomUUID();

    @BeforeEach
    void identities() {
        when(identity.findById(sender)).thenReturn(Optional.of(new UserContactView(sender, "me@example.com", "Sam Sender", "AUDIENCE")));
        when(identity.findAccountIdByEmail("friend@example.com")).thenReturn(Optional.of(friend));
        when(identity.findById(friend)).thenReturn(Optional.of(new UserContactView(friend, "friend@example.com", "Fran Friend", "AUDIENCE")));
        when(identity.findAccountIdByEmail("nobody@example.com")).thenReturn(Optional.empty());
        when(identity.findAccountIdByEmail("me@example.com")).thenReturn(Optional.of(sender));
        when(identity.findAccountIdByEmail("staff@example.com")).thenReturn(Optional.of(staff));
        when(identity.findById(staff)).thenReturn(Optional.of(new UserContactView(staff, "staff@example.com", "Gate Staff", "STAFF")));
    }

    @Test
    void onlyAudienceAccountsCanReceiveATicket() {
        var fixture = ticket("29 days", sender);
        assertThatThrownBy(() -> transfers.previewRecipient(sender, fixture.ticket, "staff@example.com"))
                .isInstanceOf(AppException.class).hasMessage("error.transfer.recipient-ineligible");
        assertThatThrownBy(() -> transfers.offer(sender, fixture.ticket, "staff@example.com"))
                .isInstanceOf(AppException.class).hasMessage("error.transfer.recipient-ineligible");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ticket_transfers WHERE ticket_id=?", Long.class, fixture.ticket))
                .isZero();
    }

    @Test
    void anOpenPaymentRefundCaseBlocksOfferAndAccept() {
        var requested = ticket("29 days", sender);
        when(payment.support(requested.order)).thenReturn(refundCase("REQUESTED"));
        assertThatThrownBy(() -> transfers.offer(sender, requested.ticket, "friend@example.com"))
                .hasMessage("error.transfer.refund-hold");

        var later = ticket("29 days", sender);
        var offer = transfers.offer(sender, later.ticket, "friend@example.com");
        when(payment.support(later.order)).thenReturn(refundCase("HOLD_PENDING"));
        assertThatThrownBy(() -> transfers.accept(friend, offer.id())).hasMessage("error.transfer.refund-hold");
        assertThat(status(later.ticket)).isEqualTo("VALID");
        assertThat(transfers.get(friend, offer.id()).status()).isEqualTo("PENDING");

        when(payment.support(later.order)).thenReturn(refundCase("ABORTED"));
        assertThat(transfers.accept(friend, offer.id()).status()).isEqualTo("ACCEPTED");
    }

    @Test
    void theCutoffUsesDoorsBeforeThePerformanceStart() {
        var fixture = ticket("90 minutes", sender);
        jdbc.update("UPDATE orders SET performance_event_id=?, performance_title='Transfer proof', performance_venue_name='Venue',"
                + " performance_starts_at=now()+interval '5 hours', performance_hold_version=1 WHERE id=?",
                UUID.randomUUID(), fixture.order);
        assertThatThrownBy(() -> transfers.offer(sender, fixture.ticket, "friend@example.com"))
                .hasMessage("error.transfer.cutoff");
    }

    private static PaymentGatewayClient.PaymentSupport refundCase(String state) {
        return new PaymentGatewayClient.PaymentSupport(null, List.of(new PaymentGatewayClient.Review(UUID.randomUUID(),
                state, 100000, null, null, null, null, null)));
    }

    @Test
    void acceptRetiresTheOldQrAndIssuesANewTicketForTheRecipient() {
        var fixture = ticket("29 days", sender);
        var offer = transfers.offer(sender, fixture.ticket, " Friend@Example.com ");
        assertThat(offer.status()).isEqualTo("PENDING");
        assertThat(offer.otherPartyName()).isEqualTo("Fran Friend");
        assertThat(transfers.offer(sender, fixture.ticket, "friend@example.com").id()).isEqualTo(offer.id());
        assertThat(transfers.state(sender, fixture.ticket).pending().id()).isEqualTo(offer.id());

        long before = jdbc.queryForObject("SELECT version FROM checkin_ticket_outbox WHERE ticket_id=?", Long.class, fixture.ticket);
        var accepted = transfers.accept(friend, offer.id());

        assertThat(accepted.status()).isEqualTo("ACCEPTED");
        UUID replacement = accepted.newTicketId();
        assertThat(status(fixture.ticket)).isEqualTo("TRANSFERRED");
        assertThat(status(replacement)).isEqualTo("VALID");
        assertThat(jdbc.queryForObject("SELECT user_id FROM tickets WHERE id=?", UUID.class, replacement)).isEqualTo(friend);
        assertThat(jdbc.queryForObject("SELECT transferred_from_ticket_id FROM tickets WHERE id=?", UUID.class, replacement))
                .isEqualTo(fixture.ticket);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets t1 JOIN tickets t2 ON t1.order_item_id=t2.order_item_id"
                + " AND t1.id<>t2.id AND t1.qr_code=t2.qr_code WHERE t1.id=?", Long.class, fixture.ticket)).isZero();
        assertThat(jdbc.queryForObject("SELECT version FROM checkin_ticket_outbox WHERE ticket_id=?", Long.class, fixture.ticket))
                .isGreaterThan(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM checkin_ticket_outbox WHERE ticket_id=?", Long.class, replacement))
                .isEqualTo(1);
        assertThat(transfers.state(friend, replacement).receivedFromName()).isEqualTo("Sam Sender");
        assertThat(transfers.state(friend, replacement).canTransfer()).isFalse();
        assertThat(transfers.state(sender, fixture.ticket).transferredToName()).isEqualTo("Fran Friend");
        assertThatThrownBy(() -> transfers.offer(friend, replacement, "me@example.com"))
                .isInstanceOf(AppException.class).hasMessage("error.transfer.received");
    }

    @Test
    void unknownEmailAndSelfAreRejectedWithoutDetail() {
        var fixture = ticket("29 days", sender);
        assertThatThrownBy(() -> transfers.offer(sender, fixture.ticket, "nobody@example.com"))
                .isInstanceOf(AppException.class).hasMessage("error.transfer.recipient-unknown");
        assertThatThrownBy(() -> transfers.offer(sender, fixture.ticket, "not-an-email"))
                .isInstanceOf(AppException.class).hasMessage("error.transfer.recipient-unknown");
        assertThatThrownBy(() -> transfers.offer(sender, fixture.ticket, "me@example.com"))
                .isInstanceOf(DomainViolation.class).hasMessage("error.transfer.self");
        assertThatThrownBy(() -> transfers.offer(friend, fixture.ticket, "friend@example.com"))
                .isInstanceOf(AppException.class).extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ErrorCode.TICKET_NOT_FOUND);
    }

    @Test
    void offersAreRejectedCloseToDoorsAndWhileRefundOrDisruptionHoldsTheOrder() {
        var close = ticket("90 minutes", sender);
        assertThatThrownBy(() -> transfers.offer(sender, close.ticket, "friend@example.com"))
                .hasMessage("error.transfer.cutoff");
        assertThat(transfers.state(sender, close.ticket).blockedReason()).isEqualTo("CUTOFF");

        var held = ticket("29 days", sender);
        jdbc.update("INSERT INTO order_refunds(case_id,order_id,ticket_ids,state,compensation) VALUES (?,?,?,'PREPARED',false)",
                UUID.randomUUID(), held.order, new UUID[] {held.ticket});
        assertThatThrownBy(() -> transfers.offer(sender, held.ticket, "friend@example.com"))
                .hasMessage("error.transfer.refund-hold");

        var disrupted = ticket("29 days", sender);
        jdbc.update("INSERT INTO event_disruptions(id,concert_id,kind,reason,actor_id) VALUES (?,?,'POSTPONE','weather',?)",
                UUID.randomUUID(), disrupted.concert, UUID.randomUUID());
        assertThatThrownBy(() -> transfers.offer(sender, disrupted.ticket, "friend@example.com"))
                .hasMessage("error.transfer.disrupted");
    }

    @Test
    void usedTicketsCannotBeOffered() {
        var fixture = ticket("29 days", sender);
        jdbc.update("UPDATE tickets SET status='USED', used_at=now() WHERE id=?", fixture.ticket);
        assertThatThrownBy(() -> transfers.offer(sender, fixture.ticket, "friend@example.com"))
                .hasMessage("error.transfer.not-valid");
    }

    @Test
    void acceptAndCancelRaceHasExactlyOneOutcome() throws Exception {
        for (int round = 0; round < 5; round++) {
            var fixture = ticket("29 days", sender);
            var offer = transfers.offer(sender, fixture.ticket, "friend@example.com");
            var start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            Future<Boolean> accept = pool.submit(attempt(start, () -> transfers.accept(friend, offer.id())));
            Future<Boolean> cancel = pool.submit(attempt(start, () -> transfers.cancel(sender, offer.id())));
            start.countDown();
            boolean accepted = accept.get();
            boolean cancelled = cancel.get();
            pool.shutdownNow();
            assertThat(accepted ^ cancelled).as("exactly one outcome").isTrue();
            String final_ = jdbc.queryForObject("SELECT status FROM ticket_transfers WHERE id=?", String.class, offer.id());
            assertThat(final_).isEqualTo(accepted ? "ACCEPTED" : "CANCELLED");
            assertThat(status(fixture.ticket)).isEqualTo(accepted ? "TRANSFERRED" : "VALID");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM tickets WHERE transferred_from_ticket_id=?", Long.class, fixture.ticket))
                    .isEqualTo(accepted ? 1L : 0L);
            assertThat(transfers.get(sender, offer.id()).status()).isEqualTo(transfers.get(friend, offer.id()).status());
        }
    }

    @Test
    void acceptAfterCutoffFailsAndTheSweeperExpiresTheOffer() {
        var fixture = ticket("29 days", sender);
        var offer = transfers.offer(sender, fixture.ticket, "friend@example.com");
        jdbc.update("UPDATE ticket_transfers SET expires_at = now() - interval '1 minute' WHERE id=?", offer.id());
        assertThatThrownBy(() -> transfers.accept(friend, offer.id())).hasMessage("error.transfer.cutoff");
        assertThat(transfers.expireDue()).isGreaterThanOrEqualTo(1);
        assertThat(transfers.get(friend, offer.id()).status()).isEqualTo("EXPIRED");
        assertThat(status(fixture.ticket)).isEqualTo("VALID");
        assertThatThrownBy(() -> transfers.cancel(sender, offer.id())).hasMessage("error.transfer.not-pending");
    }

    @Test
    void declineAndCancelReleaseTheTicketForANewOffer() {
        var fixture = ticket("29 days", sender);
        var first = transfers.offer(sender, fixture.ticket, "friend@example.com");
        assertThat(transfers.decline(friend, first.id()).status()).isEqualTo("DECLINED");
        var second = transfers.offer(sender, fixture.ticket, "friend@example.com");
        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(transfers.cancel(sender, second.id()).status()).isEqualTo("CANCELLED");
        assertThat(transfers.mine(friend)).extracting(v -> v.status()).contains("DECLINED", "CANCELLED");
        assertThatThrownBy(() -> transfers.accept(sender, second.id())).isInstanceOf(DomainViolation.class);
    }

    private Callable<Boolean> attempt(CountDownLatch start, Runnable action) {
        return () -> {
            start.await();
            try {
                action.run();
                return true;
            } catch (AppException | DomainViolation rejected) {
                return false;
            }
        };
    }

    private String status(UUID ticket) {
        return jdbc.queryForObject("SELECT status FROM tickets WHERE id=?", String.class, ticket);
    }

    private record Fixture(UUID concert, UUID order, UUID ticket) {}

    private Fixture ticket(String doorsIn, UUID holder) {
        UUID concert = UUID.randomUUID();
        UUID type = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        UUID item = UUID.randomUUID();
        UUID ticket = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,
                    sale_start_at,sale_end_at,status,created_by)
                VALUES(?,?,?,?,now()+(?::interval)+interval '1 hour',now()+(?::interval),
                    now()-interval '1 day',now()+interval '1 day','ON_SALE',?)
                """, concert, "Transfer proof", "Venue", "Address", doorsIn, doorsIn, UUID.randomUUID());
        jdbc.update("INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active)"
                + " VALUES(?,?,'General',100000,10,10,4,'#123456',true)", type, concert);
        jdbc.update("INSERT INTO orders(id,user_id,concert_id,status,total_amount,idempotency_key,paid_at)"
                + " VALUES(?,?,?,'PAID',100000,?,now())", order, holder, concert, UUID.randomUUID().toString());
        jdbc.update("INSERT INTO order_items(id,order_id,ticket_type_id,quantity,unit_price,subtotal) VALUES(?,?,?,1,100000,100000)",
                item, order, type);
        jdbc.update("INSERT INTO tickets(id,order_item_id,ticket_type_id,concert_id,user_id,qr_code,qr_secret,status)"
                + " VALUES(?,?,?,?,?,?,?,'VALID')", ticket, item, type, concert, holder, "qr-" + ticket, "secret-" + ticket);
        return new Fixture(concert, order, ticket);
    }

    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    @Container static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3-management");

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
}
