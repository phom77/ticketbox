package org.ticketbox.ticketing.order.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
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
import org.ticketbox.ticketing.infrastructure.integration.payment.PaymentRemoteClient;
import org.ticketbox.ticketing.issuance.application.TicketTransferService;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
            "ticketbox.refund-requests.handoff-delay-ms=3600000",
            "ticketbox.orders.expiration.fixed-delay-ms=3600000",
            "ticketbox.holds.cleanup-interval-ms=3600000",
            "spring.rabbitmq.listener.simple.auto-startup=false",
            "ticketbox.security.jwt.secret=phase1-test-fixture-secret-with-at-least-sixty-four-characters-local-only"
        })
@Testcontainers
class RefundRequestIntegrationTest {
    @Autowired private RefundRequestService requests;
    @Autowired private RefundOrderEffects effects;
    @Autowired private TicketTransferService transfers;
    @Autowired private JdbcTemplate jdbc;
    @MockBean private RefundProviders providers;
    @MockBean private PaymentRemoteClient payment;
    @MockBean private UserContactPort identity;

    private final UUID buyer = UUID.randomUUID();
    private final UUID organizer = UUID.randomUUID();
    private final UUID organization = UUID.randomUUID();

    @BeforeEach
    void stubs() {
        reset(providers, payment);
        when(providers.apply(any(), any())).thenAnswer(call -> new RefundProviders.Case(UUID.randomUUID(), call.getArgument(0),
                "REQUESTED", 100000, organizer, null, "MOCK", "tx", null, null, false));
        UUID friend = UUID.randomUUID();
        when(identity.findAccountIdByEmail("friend@example.com")).thenReturn(Optional.of(friend));
        when(identity.findById(friend)).thenReturn(Optional.of(new UserContactView(friend, "friend@example.com", "Fran", "AUDIENCE")));
    }

    @Test
    void buyerRequestIsApprovedByTheOrganizerAndOpensOnePlatformCase() {
        var fixture = order("3 days");
        var state = requests.state(buyer, fixture.order);
        assertThat(state.canRequest()).isTrue();
        assertThat(state.origin()).isEqualTo("BUYER");

        var created = requests.request(buyer, fixture.order, " Cannot attend ");
        assertThat(created.status()).isEqualTo("REQUESTED");
        assertThat(created.canWithdraw()).isTrue();
        assertThat(requests.state(buyer, fixture.order).canRequest()).isFalse();
        assertThat(requests.state(buyer, fixture.order).blockedReason()).isEqualTo("REQUEST_OPEN");
        assertThatThrownBy(() -> requests.request(buyer, fixture.order, "again")).hasMessage("error.refund-request.already-open");
        assertThat(requests.list(organization, null, null, 0, 10).content()).extracting(r -> r.id()).containsExactly(created.id());

        UUID otherOrganization = UUID.randomUUID();
        assertThat(requests.list(otherOrganization, null, null, 0, 10).content()).isEmpty();
        assertThatThrownBy(() -> requests.approve(otherOrganization, organizer, created.id()))
                .isInstanceOf(AppException.class).extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(ErrorCode.REFUND_REQUEST_NOT_FOUND);
        assertThatThrownBy(() -> requests.reject(otherOrganization, organizer, created.id(), "no")).isInstanceOf(AppException.class);

        var approved = requests.approve(organization, organizer, created.id());
        assertThat(approved.status()).isEqualTo("APPROVED");
        assertThat(approved.awaitingCase()).isFalse();
        var command = ArgumentCaptor.forClass(RefundProviders.Command.class);
        verify(providers).apply(eq(fixture.order), command.capture());
        assertThat(command.getValue().origin()).isEqualTo("BUYER");
        assertThat(command.getValue().refundRequestId()).isEqualTo(created.id());
        assertThat(command.getValue().actorId()).isEqualTo(organizer);
        assertThat(command.getValue().action()).isEqualTo(RefundProviders.Action.REQUEST);
        assertThat(jdbc.queryForObject("SELECT payment_case_id FROM refund_requests WHERE id=?", UUID.class, created.id())).isNotNull();
        assertThatThrownBy(() -> requests.approve(organization, organizer, created.id())).hasMessage("error.refund-request.not-open");
        assertThatThrownBy(() -> requests.withdraw(buyer, fixture.order, created.id())).hasMessage("error.refund-request.not-open");
    }

    @Test
    void rejectionNeedsANoteAndLetsTheBuyerAskAgain() {
        var fixture = order("3 days");
        var created = requests.request(buyer, fixture.order, "Changed plans");
        assertThatThrownBy(() -> requests.reject(organization, organizer, created.id(), " ")).hasMessage("error.refund-request.note-required");
        var rejected = requests.reject(organization, organizer, created.id(), "Outside the refund policy");
        assertThat(rejected.status()).isEqualTo("REJECTED");
        var state = requests.state(buyer, fixture.order);
        assertThat(state.request().decisionNote()).isEqualTo("Outside the refund policy");
        assertThat(state.canRequest()).isTrue();
        assertThat(requests.request(buyer, fixture.order, "Please reconsider").status()).isEqualTo("REQUESTED");
    }

    @Test
    void buyerCanWithdrawBeforeTheOrganizerDecidesAndOnlyTheBuyerSeesTheOrder() {
        var fixture = order("3 days");
        var created = requests.request(buyer, fixture.order, "Changed plans");
        assertThatThrownBy(() -> requests.state(UUID.randomUUID(), fixture.order)).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> requests.request(UUID.randomUUID(), fixture.order, "x")).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> requests.withdraw(UUID.randomUUID(), fixture.order, created.id())).hasMessage("error.refund-request.not-found");
        assertThat(requests.withdraw(buyer, fixture.order, created.id()).status()).isEqualTo("WITHDRAWN");
        assertThat(requests.request(buyer, fixture.order, "Changed plans again").status()).isEqualTo("REQUESTED");
    }

    @Test
    void ineligibleOrdersAreRejectedWithAnExplanation() {
        var used = order("3 days");
        jdbc.update("UPDATE tickets SET status='USED', used_at=now() WHERE id=?", used.ticket);
        assertThatThrownBy(() -> requests.request(buyer, used.order, "x")).hasMessage("error.refund-request.ticket-used");

        var moved = order("3 days");
        jdbc.update("UPDATE tickets SET status='TRANSFERRED' WHERE id=?", moved.ticket);
        assertThatThrownBy(() -> requests.request(buyer, moved.order, "x")).hasMessage("error.refund-request.ticket-transferred");

        var pending = order("3 days");
        jdbc.update("INSERT INTO ticket_transfers(id,ticket_id,sender_id,recipient_id,sender_name,recipient_name,status,expires_at)"
                + " VALUES (?,?,?,?,'A','B','PENDING',now()+interval '1 day')", UUID.randomUUID(), pending.ticket, buyer, UUID.randomUUID());
        assertThatThrownBy(() -> requests.request(buyer, pending.order, "x")).hasMessage("error.refund-request.transfer-pending");

        var close = order("10 hours");
        assertThatThrownBy(() -> requests.request(buyer, close.order, "x")).hasMessage("error.refund-request.window-closed");

        var cancelled = order("3 days");
        jdbc.update("INSERT INTO event_disruptions(id,concert_id,kind,reason,actor_id) VALUES (?,?,'CANCEL','weather',?)",
                UUID.randomUUID(), cancelled.concert, UUID.randomUUID());
        assertThatThrownBy(() -> requests.request(buyer, cancelled.order, "x")).hasMessage("error.refund-request.cancelled");

        var held = order("3 days");
        jdbc.update("INSERT INTO order_refunds(case_id,order_id,ticket_ids,state,compensation) VALUES (?,?,?,'PREPARED',false)",
                UUID.randomUUID(), held.order, new UUID[] {held.ticket});
        assertThatThrownBy(() -> requests.request(buyer, held.order, "x")).hasMessage("error.refund-request.refund-in-progress");

        var operatorCase = order("3 days");
        when(payment.support(operatorCase.order)).thenReturn(new PaymentGatewayClient.PaymentSupport(null, List.of(
                new PaymentGatewayClient.Review(UUID.randomUUID(), "REQUESTED", 100000, null, null, null, null, null))));
        assertThatThrownBy(() -> requests.request(buyer, operatorCase.order, "x")).hasMessage("error.refund-request.refund-in-progress");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refund_requests WHERE buyer_id=?", Long.class, buyer)).isZero();
    }

    @Test
    void postponedEventsGoStraightToAPlatformCaseWithoutTheOrganizer() {
        var fixture = order("1 hour");
        jdbc.update("INSERT INTO event_disruptions(id,concert_id,kind,reason,actor_id,event_date) VALUES (?,?,'POSTPONE','venue',?,now()+interval '40 days')",
                UUID.randomUUID(), fixture.concert, UUID.randomUUID());
        var state = requests.state(buyer, fixture.order);
        assertThat(state.canRequest()).isTrue();
        assertThat(state.origin()).isEqualTo("POSTPONEMENT");
        var created = requests.request(buyer, fixture.order, "New date does not suit");
        assertThat(created.status()).isEqualTo("APPROVED");
        var command = ArgumentCaptor.forClass(RefundProviders.Command.class);
        verify(providers).apply(eq(fixture.order), command.capture());
        assertThat(command.getValue().origin()).isEqualTo("POSTPONEMENT");
        assertThat(command.getValue().actorId()).isEqualTo(buyer);
        assertThat(jdbc.queryForObject("SELECT payment_case_id FROM refund_requests WHERE id=?", UUID.class, created.id())).isNotNull();
    }

    @Test
    void aFailedHandoffIsRetriedWithoutAskingTheBuyerAgain() {
        var fixture = order("1 hour");
        jdbc.update("INSERT INTO event_disruptions(id,concert_id,kind,reason,actor_id,event_date) VALUES (?,?,'POSTPONE','venue',?,now()+interval '40 days')",
                UUID.randomUUID(), fixture.concert, UUID.randomUUID());
        when(providers.apply(any(), any())).thenThrow(new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE));
        var created = requests.request(buyer, fixture.order, "New date does not suit");
        assertThat(created.status()).isEqualTo("APPROVED");
        assertThat(jdbc.queryForObject("SELECT payment_case_id FROM refund_requests WHERE id=?", UUID.class, created.id())).isNull();

        reset(providers);
        when(providers.apply(any(), any())).thenAnswer(call -> new RefundProviders.Case(UUID.randomUUID(), call.getArgument(0),
                "REQUESTED", 100000, buyer, null, "MOCK", "tx", null, null, false));
        jdbc.update("UPDATE refund_requests SET decided_at = now() - interval '5 minutes' WHERE id=?", created.id());
        assertThat(requests.retryHandoffs()).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT payment_case_id FROM refund_requests WHERE id=?", UUID.class, created.id())).isNotNull();
    }

    @Test
    void theConfirmedRefundClosesTheRequestAndAnAbortedCaseFailsIt() {
        var confirmed = order("3 days");
        var request = requests.request(buyer, confirmed.order, "Changed plans");
        requests.approve(organization, organizer, request.id());
        UUID caseId = jdbc.queryForObject("SELECT payment_case_id FROM refund_requests WHERE id=?", UUID.class, request.id());
        prepared(confirmed, caseId);
        var result = new RefundOrderEffects.Result(1, caseId, confirmed.order, "CONFIRMED", 100000, "MOCK", "pay-" + confirmed.order,
                "bank-ref-1", OffsetDateTime.now(), false);
        effects.apply(result);
        assertThat(status(request.id())).isEqualTo("REFUNDED");
        assertThat(jdbc.queryForObject("SELECT status FROM tickets WHERE id=?", String.class, confirmed.ticket)).isEqualTo("CANCELLED");
        effects.apply(result);
        assertThat(status(request.id())).isEqualTo("REFUNDED");

        var aborted = order("3 days");
        var second = requests.request(buyer, aborted.order, "Changed plans");
        requests.approve(organization, organizer, second.id());
        UUID abortedCase = jdbc.queryForObject("SELECT payment_case_id FROM refund_requests WHERE id=?", UUID.class, second.id());
        prepared(aborted, abortedCase);
        var abort = new RefundOrderEffects.Result(1, abortedCase, aborted.order, "ABORTED", 100000, "MOCK", "pay-" + aborted.order,
                null, null, false);
        effects.apply(abort);
        effects.apply(abort);
        assertThat(status(second.id())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("SELECT status FROM tickets WHERE id=?", String.class, aborted.ticket)).isEqualTo("VALID");
    }

    @Test
    void anOpenRequestBlocksNewTransferOffersAndAPendingTransferBlocksTheRequest() {
        var fixture = order("3 days");
        var created = requests.request(buyer, fixture.order, "Changed plans");
        when(identity.findById(buyer)).thenReturn(Optional.of(new UserContactView(buyer, "me@example.com", "Me", "AUDIENCE")));
        assertThatThrownBy(() -> transfers.offer(buyer, fixture.ticket, "friend@example.com")).hasMessage("error.transfer.refund-hold");
        requests.withdraw(buyer, fixture.order, created.id());
        assertThat(transfers.offer(buyer, fixture.ticket, "friend@example.com").status()).isEqualTo("PENDING");
        assertThatThrownBy(() -> requests.request(buyer, fixture.order, "x")).hasMessage("error.refund-request.transfer-pending");
    }

    private void prepared(Fixture fixture, UUID caseId) {
        jdbc.update("INSERT INTO order_refunds(case_id,order_id,ticket_ids,state,compensation) VALUES (?,?,?,'PREPARED',false)",
                caseId, fixture.order, new UUID[] {fixture.ticket});
    }

    private String status(UUID request) {
        return jdbc.queryForObject("SELECT status FROM refund_requests WHERE id=?", String.class, request);
    }

    private record Fixture(UUID concert, UUID order, UUID ticket) {}

    private Fixture order(String doorsIn) {
        UUID concert = UUID.randomUUID();
        UUID type = UUID.randomUUID();
        UUID order = UUID.randomUUID();
        UUID item = UUID.randomUUID();
        UUID ticket = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,
                    sale_start_at,sale_end_at,status,created_by,organization_id)
                VALUES(?,?,?,?,now()+(?::interval)+interval '1 hour',now()+(?::interval),
                    now()-interval '1 day',now()+interval '1 day','ON_SALE',?,?)
                """, concert, "Refund proof", "Venue", "Address", doorsIn, doorsIn, UUID.randomUUID(), organization);
        jdbc.update("INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active)"
                + " VALUES(?,?,'General',100000,10,9,4,'#123456',true)", type, concert);
        jdbc.update("INSERT INTO orders(id,user_id,concert_id,status,total_amount,idempotency_key,paid_at,payment_provider,payment_ref)"
                + " VALUES(?,?,?,'PAID',100000,?,now(),'MOCK',?)", order, buyer, concert, UUID.randomUUID().toString(), "pay-" + order);
        jdbc.update("INSERT INTO order_items(id,order_id,ticket_type_id,quantity,unit_price,subtotal) VALUES(?,?,?,1,100000,100000)",
                item, order, type);
        jdbc.update("INSERT INTO tickets(id,order_item_id,ticket_type_id,concert_id,user_id,qr_code,qr_secret,status)"
                + " VALUES(?,?,?,?,?,?,?,'VALID')", ticket, item, type, concert, buyer, "qr-" + ticket, "secret-" + ticket);
        jdbc.update("INSERT INTO order_events(order_id,stream_version,event_type,payload)"
                + " SELECT id,1,'OrderImported',order_projection_snapshot(id) FROM orders WHERE id=?", order);
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
