package org.ticketbox.ticketing.order.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.inventory.hold.application.ReservationService;
import org.ticketbox.ticketing.order.application.dto.CreateOrderRequest;
import org.ticketbox.ticketing.order.application.dto.OrderItemRequest;
import org.ticketbox.ticketing.order.application.port.OrderItemRepository;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.queue.infrastructure.WaitingRoomService;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;

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
class OrderConcurrencyIntegrationTest {

    @Autowired
    private org.ticketbox.ticketing.application.port.payment.PaymentWorkflowPort workflow;

    @Autowired private org.ticketbox.ticketing.order.infrastructure.OrderEventStore orderEvents;

    private org.ticketbox.ticketing.application.port.payment.PaymentResult money(
            org.ticketbox.ticketing.application.port.payment.PaymentIntent intent, UUID event) {
        return new org.ticketbox.ticketing.application.port.payment.PaymentResult(
                1,
                event,
                intent.intentId(),
                intent.orderId(),
                intent.userId(),
                intent.provider(),
                intent.requestId(),
                intent.amount(),
                intent.currency(),
                intent.orderVersion(),
                "workflow-" + intent.intentId(),
                OffsetDateTime.now());
    }

    @Test
    void paymentWorkflowConcurrentIntentAndReceiptIssueOneTicket() throws Exception {
        var fixture = createFixture(10, 4);
        var user = createAudienceUsers(1).getFirst();
        var order = createPaymentOrder(fixture, user);
        var ids = java.util.concurrent.ConcurrentHashMap.<UUID>newKeySet();
        runConcurrently(
                12,
                n -> {
                    ids.add(workflow.prepare(order, user.getId(), "MOCK").intentId());
                    return AttemptResult.succeeded();
                });
        assertThat(ids).hasSize(1);
        var intent = workflow.prepare(order, user.getId(), "MOCK");
        var result = money(intent, UUID.randomUUID());
        runConcurrently(
                12,
                n -> {
                    assertThat(workflow.receive(result).decision()).isEqualTo("ACCEPTED");
                    return AttemptResult.succeeded();
                });
        assertThat(
                        inventoryJdbc.queryForObject(
                                "SELECT count(*) FROM ticketing_payment_inbox WHERE intent_id=?",
                                Integer.class,
                                intent.intentId()))
                .isEqualTo(1);
        assertThat(
                        inventoryJdbc.queryForObject(
                                "SELECT count(*) FROM tickets t JOIN order_items i ON"
                                        + " i.id=t.order_item_id WHERE i.order_id=?",
                                Integer.class,
                                order))
                .isEqualTo(1);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(9);
        assertThat(
                        inventoryJdbc.queryForList(
                                "SELECT event_type FROM order_events WHERE order_id=? ORDER BY"
                                        + " stream_version",
                                String.class,
                                order))
                .containsExactly("OrderCreated", "OrderPaid");
        assertThat(
                        inventoryJdbc.queryForObject(
                                "SELECT replay_order(?) ->> 'status'", String.class, order))
                .isEqualTo("PAID");

        var transaction =
                new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () ->
                                transaction.executeWithoutResult(
                                        status -> {
                                            var projection =
                                                    orderRepository
                                                            .findByIdForUpdate(order)
                                                            .orElseThrow();
                                            projection.setStatus(Order.Status.CANCELLED);
                                            orderEvents.record(
                                                    projection,
                                                    1,
                                                    org.ticketbox.ticketing.order.infrastructure
                                                            .OrderEventStore.Transition
                                                            .OrderCancelled);
                                        }))
                .isInstanceOf(org.springframework.dao.OptimisticLockingFailureException.class);
        assertThat(orderRepository.findById(order).orElseThrow().getStatus())
                .isEqualTo(Order.Status.PAID);
    }

    @Test
    void paymentWorkflowRejectsMismatchedMoneyWithoutPoisoningInbox() {
        var fixture = createFixture(10, 4);
        var user = createAudienceUsers(1).getFirst();
        var order = createPaymentOrder(fixture, user);
        var i = workflow.prepare(order, user.getId(), "MOCK");
        var event = UUID.randomUUID();
        var valid = money(i, event);
        var bad =
                new org.ticketbox.ticketing.application.port.payment.PaymentResult(
                        1,
                        event,
                        i.intentId(),
                        order,
                        user.getId(),
                        "MOCK",
                        i.requestId(),
                        i.amount().add(BigDecimal.ONE),
                        "VND",
                        1,
                        valid.transactionId(),
                        OffsetDateTime.now());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> workflow.receive(bad))
                .isInstanceOf(AppException.class);
        assertThat(
                        inventoryJdbc.queryForObject(
                                "SELECT count(*) FROM ticketing_payment_inbox WHERE event_id=?",
                                Integer.class,
                                event))
                .isZero();
        assertThat(workflow.receive(valid).decision()).isEqualTo("ACCEPTED");
    }

    @Test
    void paymentWorkflowLateMoneyCannotResurrectCancelledStock() {
        var fixture = createFixture(10, 4);
        var user = createAudienceUsers(1).getFirst();
        var order = createPaymentOrder(fixture, user);
        var i = workflow.prepare(order, user.getId(), "MOCK");
        orderService.cancelOrder(order, user.getId());
        var result = money(i, UUID.randomUUID());
        assertThat(workflow.receive(result).decision()).isEqualTo("REJECTED");
        assertThat(workflow.receive(result).decision()).isEqualTo("REJECTED");
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(10);
        assertThat(
                        inventoryJdbc.queryForObject(
                                "SELECT count(*) FROM tickets WHERE concert_id=?",
                                Integer.class,
                                fixture.concert().getId()))
                .isZero();
    }

    @Test
    void paymentWorkflowStaleDispatchCannotOverwriteSettlement() {
        var fixture = createFixture(10, 4);
        var user = createAudienceUsers(1).getFirst();
        var order = createPaymentOrder(fixture, user);
        var i = workflow.prepare(order, user.getId(), "MOCK");
        var old =
                workflow.claim(200).stream()
                        .filter(c -> c.intent().intentId().equals(i.intentId()))
                        .findFirst()
                        .orElseThrow();
        inventoryJdbc.update(
                "UPDATE ticketing_payment_intents SET lease_until=now()-interval '1 second' WHERE"
                        + " order_id=?",
                order);
        var current =
                workflow.claim(200).stream()
                        .filter(c -> c.intent().intentId().equals(i.intentId()))
                        .findFirst()
                        .orElseThrow();
        var snapshot =
                new org.ticketbox.ticketing.application.port.payment.PaymentSnapshot(
                        UUID.randomUUID(), "READY", "https://fixture.local/pay", i.requestId());
        workflow.snapshot(old, snapshot);
        assertThat(workflow.owned(order, user.getId()).snapshot().state()).isEqualTo("PROCESSING");
        workflow.receive(money(i, UUID.randomUUID()));
        workflow.snapshot(current, snapshot);
        assertThat(workflow.owned(order, user.getId()).snapshot().state()).isEqualTo("SUCCEEDED");
    }

    @Autowired private org.ticketbox.ticketing.inventory.application.port.InventoryPort inventory;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate inventoryJdbc;

    @Test
    void ticketingAuthorityIgnoresProjectionStockAndRejectsAllocatedResize() {
        var fixture = createFixture(10, 4);
        var id = fixture.ticketType().getId();
        assertThat(inventory.reserve(id, 2)).isTrue();
        assertThat(inventory.available(id)).isEqualTo(8);
        assertThat(
                        inventoryJdbc.queryForObject(
                                "SELECT available_qty FROM ticket_types WHERE id=?",
                                Integer.class,
                                id))
                .isEqualTo(10);
        inventoryJdbc.update("UPDATE ticket_types SET available_qty=9 WHERE id=?", id);
        assertThat(inventory.available(id)).isEqualTo(8);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> inventory.resizePristine(id, 20))
                .isInstanceOf(AppException.class);
        assertThat(inventory.available(id)).isEqualTo(8);
        inventory.release(id, 2);
        assertThat(inventory.available(id)).isEqualTo(10);
        inventory.setActive(id, false);
        assertThat(inventory.reserve(id, 1)).isFalse();
        inventory.setActive(id, true);
    }

    @Autowired private ReservationService reservations;

    @Autowired
    private org.ticketbox.ticketing.inventory.hold.application.port.TicketHoldRepository holds;

    @Autowired private org.springframework.context.ApplicationEventPublisher domainEvents;

    @org.springframework.boot.test.mock.mockito.SpyBean
    private org.ticketbox.ticketing.infrastructure.integration.notification
                    .ConfirmedMessagePublisher
            confirmedPublisher;

    @Test
    void notificationBrokerCallDoesNotHoldTheListenerDbTransaction() throws Exception {
        var fixture = createFixture(20, 4);
        var buyer = createAudienceUsers(1).getFirst();
        var orderId = createPaymentOrder(fixture, buyer);
        orderService.handlePaymentSuccess(orderId, "MOCK", "test-broker-ref");
        var event =
                new com.ticketbox.shared.event.PaymentCompletedEvent(
                        UUID.randomUUID(),
                        orderId,
                        buyer.getId(),
                        "MOCK",
                        "test-broker-ref",
                        fixture.ticketType().getPrice(),
                        OffsetDateTime.now());
        var called = new CountDownLatch(1);
        var active = new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(
                        call -> {
                            active.set(
                                    org.springframework.transaction.support
                                            .TransactionSynchronizationManager
                                            .isActualTransactionActive());
                            called.countDown();
                            return null;
                        })
                .when(confirmedPublisher)
                .publish(
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.argThat(
                                payload ->
                                        payload
                                                        instanceof
                                                        com.ticketbox.shared.event
                                                                                .RemoteNotificationRequested
                                                                        message
                                                && message.eventId().equals(event.eventId())),
                        org.mockito.ArgumentMatchers.anyString());
        new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> domainEvents.publishEvent(event));
        assertThat(called.await(8, TimeUnit.SECONDS)).isTrue();
        assertThat(active.get()).isFalse();
    }

    @Autowired private org.springframework.modulith.events.IncompleteEventPublications publications;
    @Autowired private com.fasterxml.jackson.databind.ObjectMapper json;

    @Test
    void pendingBaselinePublicationsReplayAndCompleteWithTheirStoredIdentities() throws Exception {
        var fixture = createFixture(20, 4);
        var buyer = createAudienceUsers(1).getFirst();
        var order = createPaymentOrder(fixture, buyer);
        var holdingUser = createAudienceUsers(1).getFirst();
        String token = admit(fixture, holdingUser);
        reservations.reserve(
                fixture.concert().getId(),
                fixture.ticketType().getId(),
                2,
                holdingUser.getId(),
                token);

        UUID left =
                insertBaselinePublication(
                        "com.ticketbox.module.ticket.application.UserLeftQueueListener",
                        new com.ticketbox.shared.event.UserLeftQueueEvent(
                                fixture.concert().getId(), holdingUser.getId(), token));
        var paidEvent =
                new com.ticketbox.shared.event.PaymentCompletedEvent(
                        UUID.randomUUID(),
                        order,
                        buyer.getId(),
                        "MOCK",
                        "baseline-ref",
                        fixture.ticketType().getPrice(),
                        OffsetDateTime.now(java.time.ZoneOffset.UTC));
        UUID paid =
                insertBaselinePublication(
                        "com.ticketbox.module.ticket.application.PaymentCompletedListener",
                        paidEvent);
        var reminder =
                new com.ticketbox.shared.event.RemoteNotificationRequested(
                        1,
                        "concert.reminder-requested",
                        UUID.randomUUID(),
                        fixture.concert().getId(),
                        buyer.getId(),
                        OffsetDateTime.now(java.time.ZoneOffset.UTC),
                        "baseline-reminder",
                        java.util.Map.of());
        UUID reminded =
                insertBaselinePublication(
                        "com.ticketbox.infrastructure.integration.RemoteReminderListener",
                        reminder);
        org.mockito.Mockito.doNothing()
                .when(confirmedPublisher)
                .publish(
                        org.mockito.ArgumentMatchers.eq("notification.commands.v1"),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.eq(paidEvent.eventId().toString()));
        org.mockito.Mockito.doNothing()
                .when(confirmedPublisher)
                .publish(
                        org.mockito.ArgumentMatchers.eq("notification.commands.v1"),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.eq(reminder.eventId().toString()));

        var pending = java.util.Set.of(left, paid, reminded);
        publications.resubmitIncompletePublications(
                publication -> pending.contains(publication.getIdentifier()));

        org.awaitility.Awaitility.await()
                .atMost(java.time.Duration.ofSeconds(10))
                .untilAsserted(
                        () -> {
                            assertThat(
                                            inventoryJdbc.queryForObject(
                                                    """
SELECT count(*) FROM event_publication WHERE id IN (?,?,?) AND completion_date IS NOT NULL
""",
                                                    Integer.class,
                                                    left,
                                                    paid,
                                                    reminded))
                                    .isEqualTo(3);
                            assertThat(
                                            holds.findByUserIdAndConcertId(
                                                    holdingUser.getId(), fixture.concert().getId()))
                                    .isEmpty();
                            assertThat(
                                            inventoryJdbc.queryForObject(
                                                    "SELECT status FROM orders WHERE id=?",
                                                    String.class,
                                                    order))
                                    .isEqualTo("PAID");
                            assertThat(
                                            inventoryJdbc.queryForObject(
                                                    """
SELECT count(*) FROM tickets t JOIN order_items i ON t.order_item_id=i.id WHERE i.order_id=?
""",
                                                    Integer.class,
                                                    order))
                                    .isEqualTo(1);
                        });
    }

    private UUID insertBaselinePublication(String listener, Object event) throws Exception {
        UUID id = UUID.randomUUID();
        String type = event.getClass().getName();
        inventoryJdbc.update(
                """
INSERT INTO event_publication(id,listener_id,event_type,serialized_event,publication_date)
VALUES(?,?,?,?,now())
""",
                id,
                listener + ".on(" + type + ")",
                type,
                json.writeValueAsString(event));
        return id;
    }

    @Test
    void explicitLeaveCommitsItsPublicationAndReleasesHeldStockPromptly() {
        var fixture = createFixture(20, 4);
        var buyer = createAudienceUsers(1).getFirst();
        var token = admit(fixture, buyer);
        reservations.reserve(
                fixture.concert().getId(), fixture.ticketType().getId(), 2, buyer.getId(), token);
        waitingRoomService.leave(fixture.concert().getId(), buyer.getId());
        org.awaitility.Awaitility.await()
                .atMost(java.time.Duration.ofSeconds(8))
                .untilAsserted(
                        () -> {
                            assertThat(
                                            holds.findByUserIdAndConcertId(
                                                    buyer.getId(), fixture.concert().getId()))
                                    .isEmpty();
                            assertThat(inventory.available(fixture.ticketType().getId()))
                                    .isEqualTo(20);
                        });
    }

    private String admit(PurchaseFixture fixture, FixtureUser user) {
        waitingRoomService.join(fixture.concert().getId(), user.getId());
        waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
        return waitingRoomService
                .internalStatus(fixture.concert().getId(), user.getId())
                .queueAccessToken();
    }

    @Test
    void concurrentHoldRequestsAreSerializedByDbAndRespectQuota() throws Exception {
        var fixture = createFixture(100, 4);
        var buyer = createAudienceUsers(1).getFirst();
        String token = admit(fixture, buyer);
        var results =
                runConcurrently(
                        16,
                        index -> {
                            try {
                                reservations.reserve(
                                        fixture.concert().getId(),
                                        fixture.ticketType().getId(),
                                        1,
                                        buyer.getId(),
                                        token);
                                return AttemptResult.succeeded();
                            } catch (AppException failure) {
                                return AttemptResult.failed(failure.getErrorCode());
                            }
                        });
        assertThat(results.stream().filter(AttemptResult::success).count()).isEqualTo(4);
        assertThat(
                        holds.findByUserIdAndConcertId(buyer.getId(), fixture.concert().getId())
                                .getFirst()
                                .getQuantity())
                .isEqualTo(4);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(96);
    }

    @Test
    void concurrentCleanupCannotReturnExpiredHoldTwiceAndStaleLeaveCannotRemoveNewHold()
            throws Exception {
        var fixture = createFixture(20, 4);
        var buyer = createAudienceUsers(1).getFirst();
        String old = admit(fixture, buyer);
        var hold =
                reservations.reserve(
                        fixture.concert().getId(),
                        fixture.ticketType().getId(),
                        2,
                        buyer.getId(),
                        old);
        hold.setExpiresAt(OffsetDateTime.now().minusMinutes(1));
        holds.saveAndFlush(hold);
        runConcurrently(
                12,
                index -> {
                    reservations.cleanupExpiredHoldsForOwner(
                            buyer.getId(), fixture.concert().getId());
                    return AttemptResult.succeeded();
                });
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(20);
        waitingRoomService.leave(fixture.concert().getId(), buyer.getId());
        String current = admit(fixture, buyer);
        reservations.reserve(
                fixture.concert().getId(), fixture.ticketType().getId(), 1, buyer.getId(), current);
        reservations.releaseHoldsForSession(buyer.getId(), fixture.concert().getId(), old);
        assertThat(
                        holds.findByUserIdAndConcertId(buyer.getId(), fixture.concert().getId())
                                .getFirst()
                                .getSessionToken())
                .isEqualTo(current);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(19);
    }

    @Test
    void conversionReleasesOmittedSkuAndRejectsDuplicateItems() {
        var fixture = createFixture(20, 4);
        var buyer = createAudienceUsers(1).getFirst();
        String token = admit(fixture, buyer);
        var extra =
                insertTicketType(fixture.concert().getId(), "Other zone", BigDecimal.ONE, 20, 4);
        reservations.reserve(fixture.concert().getId(), extra.getId(), 2, buyer.getId(), token);
        var item = new OrderItemRequest(fixture.ticketType().getId(), 1);
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () ->
                                orderService.createOrder(
                                        new CreateOrderRequest(
                                                fixture.concert().getId(), List.of(item, item)),
                                        buyer.getId(),
                                        UUID.randomUUID().toString(),
                                        token))
                .isInstanceOf(AppException.class);
        orderService.createOrder(
                new CreateOrderRequest(fixture.concert().getId(), List.of(item)),
                buyer.getId(),
                UUID.randomUUID().toString(),
                token);
        assertThat(holds.findByUserIdAndConcertId(buyer.getId(), fixture.concert().getId()))
                .isEmpty();
        assertThat(inventory.available(extra.getId())).isEqualTo(20);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(19);
    }

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    static GenericContainer<?> redis =
            new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

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

    @Autowired private OrderService orderService;

    @Autowired private WaitingRoomService waitingRoomService;

    @Autowired private OrderRepository orderRepository;

    @Autowired private OrderItemRepository orderItemRepository;

    @Autowired
    private org.springframework.transaction.PlatformTransactionManager transactionManager;

    @Test
    @DisplayName("One ticket: only one of 50 concurrent buyers succeeds")
    void concurrentBuyersCannotOversellTheLastTickets() throws Exception {
        int initialInventory = 1;
        int buyerCount = 50;
        PurchaseFixture fixture = createFixture(initialInventory, initialInventory);
        List<FixtureUser> buyers = createAudienceUsers(buyerCount);
        // All 50 buyers have already been admitted: this burst measures DB inventory arbitration.
        for (FixtureUser buyer : buyers)
            waitingRoomService.join(fixture.concert().getId(), buyer.getId());
        while (waitingRoomService.snapshot(fixture.concert().getId()).queueSize() > 0) {
            waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
        }

        List<AttemptResult> results =
                runConcurrently(
                        buyerCount,
                        worker ->
                                attemptOrder(
                                        fixture,
                                        buyers.get(worker).getId(),
                                        1,
                                        "oversell-" + UUID.randomUUID()));

        long successfulOrders = results.stream().filter(AttemptResult::success).count();
        long soldOutAttempts =
                results.stream()
                        .filter(result -> result.errorCode() == ErrorCode.TICKET_SOLD_OUT)
                        .count();
        int storedQuantity = activeQuantity(fixture.ticketType().getId());

        printResult(
                "OVERSELL PROTECTION",
                "Initial inventory",
                initialInventory,
                "Concurrent buyers",
                buyerCount,
                "Successful orders",
                successfulOrders,
                "Sold-out requests",
                soldOutAttempts,
                "Stored order quantity",
                storedQuantity,
                "Remaining inventory",
                inventory.available(fixture.ticketType().getId()));

        assertThat(successfulOrders).isEqualTo(initialInventory);
        assertThat(soldOutAttempts).isEqualTo(buyerCount - initialInventory);
        assertThat(inventory.available(fixture.ticketType().getId())).isZero();
        assertThat(storedQuantity).isEqualTo(initialInventory);
        assertThat(inventory.available(fixture.ticketType().getId()) + storedQuantity)
                .isEqualTo(initialInventory);
    }

    @Test
    @DisplayName("One account cannot exceed max_per_account under concurrent requests")
    void concurrentRequestsFromOneAccountCannotExceedMaxPerAccount() throws Exception {
        int maxPerAccount = 2;
        int requestCount = 20;
        PurchaseFixture fixture = createFixture(100, maxPerAccount);
        FixtureUser buyer = createAudienceUsers(1).getFirst();

        List<AttemptResult> results =
                runConcurrently(
                        requestCount,
                        worker ->
                                attemptOrder(
                                        fixture,
                                        buyer.getId(),
                                        maxPerAccount,
                                        "account-limit-" + worker + "-" + UUID.randomUUID()));

        int userQuantity =
                orderItemRepository.sumQuantityByUserIdAndTicketTypeId(
                        buyer.getId(),
                        fixture.ticketType().getId(),
                        List.of(Order.Status.AWAITING_PAYMENT, Order.Status.PAID));
        long successfulOrders = results.stream().filter(AttemptResult::success).count();
        long rejectedByBusyLock =
                results.stream()
                        .filter(result -> result.errorCode() == ErrorCode.INVALID_REQUEST)
                        .count();
        long rejectedByLimit =
                results.stream()
                        .filter(result -> result.errorCode() == ErrorCode.TICKET_LIMIT_EXCEEDED)
                        .count();

        printResult(
                "MAX PER ACCOUNT",
                "Configured limit",
                maxPerAccount,
                "Concurrent requests",
                requestCount,
                "Quantity per request",
                maxPerAccount,
                "Successful orders",
                successfulOrders,
                "Rejected by active lock",
                rejectedByBusyLock,
                "Rejected by account limit",
                rejectedByLimit,
                "Final user quantity",
                userQuantity,
                "Remaining inventory",
                inventory.available(fixture.ticketType().getId()));

        assertThat(successfulOrders).isEqualTo(1);
        assertThat(userQuantity).isEqualTo(maxPerAccount);
        assertThat(inventory.available(fixture.ticketType().getId()))
                .isEqualTo(100 - maxPerAccount);
        assertThat(results)
                .allSatisfy(
                        result -> {
                            if (!result.success()) {
                                assertThat(result.errorCode())
                                        // The winner commits and consumes its admission session. A
                                        // losing
                                        // request may reach validation after that commit and be
                                        // forbidden.
                                        .isIn(
                                                ErrorCode.INVALID_REQUEST,
                                                ErrorCode.TICKET_LIMIT_EXCEEDED,
                                                ErrorCode.UNAUTHORIZED);
                            }
                        });
    }

    @Test
    @DisplayName("Concurrent requests sharing one idempotency key create one order")
    void concurrentDuplicateIdempotencyKeysCreateOnlyOneOrder() throws Exception {
        int requestCount = 20;
        PurchaseFixture fixture = createFixture(20, 20);
        FixtureUser buyer = createAudienceUsers(1).getFirst();
        String sharedKey = "duplicate-" + UUID.randomUUID();

        List<AttemptResult> results =
                runConcurrently(
                        requestCount, worker -> attemptOrder(fixture, buyer.getId(), 1, sharedKey));

        List<Order> userOrders = orderRepository.findByUserIdOrderByCreatedAtDesc(buyer.getId());
        int storedQuantity =
                orderItemRepository.sumQuantityByUserIdAndTicketTypeId(
                        buyer.getId(),
                        fixture.ticketType().getId(),
                        List.of(Order.Status.AWAITING_PAYMENT, Order.Status.PAID));
        long successfulOrders = results.stream().filter(AttemptResult::success).count();
        long duplicateRequests =
                results.stream()
                        .filter(result -> result.errorCode() == ErrorCode.DUPLICATE_IDEMPOTENCY_KEY)
                        .count();

        printResult(
                "IDEMPOTENCY",
                "Concurrent requests",
                requestCount,
                "Shared idempotency key",
                sharedKey,
                "Successful requests",
                successfulOrders,
                "Duplicate requests rejected",
                duplicateRequests,
                "Orders stored",
                userOrders.size(),
                "Stored ticket quantity",
                storedQuantity,
                "Remaining inventory",
                inventory.available(fixture.ticketType().getId()));

        assertThat(successfulOrders).isEqualTo(1);
        assertThat(userOrders).hasSize(1);
        assertThat(orderService.getOrderByIdempotencyKey(sharedKey, buyer.getId()).id())
                .isEqualTo(userOrders.getFirst().getId());
        assertThat(storedQuantity).isEqualTo(1);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(19);
        assertThat(results)
                .allSatisfy(
                        result -> {
                            if (!result.success()) {
                                assertThat(result.errorCode())
                                        .isEqualTo(ErrorCode.DUPLICATE_IDEMPOTENCY_KEY);
                            }
                        });
    }

    private UUID createPaymentOrder(PurchaseFixture fixture, FixtureUser buyer) {
        waitingRoomService.join(fixture.concert().getId(), buyer.getId());
        waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
        String token =
                waitingRoomService
                        .internalStatus(fixture.concert().getId(), buyer.getId())
                        .queueAccessToken();
        return orderService
                .createOrder(
                        new CreateOrderRequest(
                                fixture.concert().getId(),
                                List.of(new OrderItemRequest(fixture.ticketType().getId(), 1))),
                        buyer.getId(),
                        UUID.randomUUID().toString(),
                        token)
                .id();
    }

    private AttemptResult attemptOrder(
            PurchaseFixture fixture, UUID userId, int quantity, String idempotencyKey) {
        CreateOrderRequest request =
                new CreateOrderRequest(
                        fixture.concert().getId(),
                        List.of(new OrderItemRequest(fixture.ticketType().getId(), quantity)));

        try {
            waitingRoomService.join(fixture.concert().getId(), userId);
            // Admission is explicit; high test budgets isolate inventory/quota races from rate
            // policy.
            waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
            String queueAccessToken =
                    waitingRoomService
                            .internalStatus(fixture.concert().getId(), userId)
                            .queueAccessToken();
            orderService.createOrder(request, userId, idempotencyKey, queueAccessToken);
            return AttemptResult.succeeded();
        } catch (AppException exception) {
            return AttemptResult.failed(exception.getErrorCode());
        }
    }

    private PurchaseFixture createFixture(int inventory, int maxPerAccount) {
        var concert = new FixtureConcert(UUID.randomUUID());
        inventoryJdbc.update(
                """
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,
                    sale_start_at,sale_end_at,status,created_by)
                VALUES(?,?,?,?,now()+interval '30 days',now()+interval '29 days 23 hours',
                    now()-interval '1 hour',now()+interval '1 day','ON_SALE',?)
                """,
                concert.getId(),
                "Concurrency proof",
                "Test venue",
                "Test address",
                UUID.randomUUID());
        var ticketType =
                insertTicketType(
                        concert.getId(),
                        "Concurrency zone",
                        BigDecimal.valueOf(1_000_000),
                        inventory,
                        maxPerAccount);

        // Order races require a READY sale queue. Draw contention is tested separately:
        // it returns a retryable 503 instead of tying up all request threads.
        UUID preparationUser = UUID.randomUUID();
        waitingRoomService.join(concert.getId(), preparationUser);
        waitingRoomService.finishShoppingSession(concert.getId(), preparationUser);
        return new PurchaseFixture(concert, ticketType);
    }

    private FixtureTicketType insertTicketType(
            UUID concertId, String name, BigDecimal price, int inventory, int maxPerAccount) {
        var ticketType = new FixtureTicketType(UUID.randomUUID(), price);
        inventoryJdbc.update(
                """
INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active)
VALUES(?,?,?,?,?,?,?,'#123456',true)
""",
                ticketType.getId(),
                concertId,
                name,
                ticketType.getPrice(),
                inventory,
                inventory,
                maxPerAccount);
        inventoryJdbc.update(
                """
                INSERT INTO ticket_inventory(ticket_type_id,total_quantity,available_qty,active)
                VALUES(?,?,?,true)
                """,
                ticketType.getId(),
                inventory,
                inventory);
        return ticketType;
    }

    private List<FixtureUser> createAudienceUsers(int count) {
        List<FixtureUser> users = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            users.add(new FixtureUser(UUID.randomUUID()));
        }
        return users;
    }

    private int activeQuantity(UUID ticketTypeId) {
        return orderItemRepository.findAll().stream()
                .filter(item -> item.getTicketTypeId().equals(ticketTypeId))
                .mapToInt(item -> item.getQuantity())
                .sum();
    }

    private List<AttemptResult> runConcurrently(int workerCount, IntFunction<AttemptResult> action)
            throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(workerCount);
        CountDownLatch ready = new CountDownLatch(workerCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<AttemptResult>> futures = new ArrayList<>(workerCount);

        try {
            for (int worker = 0; worker < workerCount; worker++) {
                int workerIndex = worker;
                futures.add(
                        executor.submit(
                                () -> {
                                    ready.countDown();
                                    if (!start.await(10, TimeUnit.SECONDS)) {
                                        throw new IllegalStateException(
                                                "Timed out waiting for concurrent start");
                                    }
                                    return action.apply(workerIndex);
                                }));
            }

            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<AttemptResult> results = new ArrayList<>(workerCount);
            for (Future<AttemptResult> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            start.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
    }

    private void printResult(String scenario, Object... values) {
        StringBuilder output =
                new StringBuilder()
                        .append(System.lineSeparator())
                        .append("========== ")
                        .append(scenario)
                        .append(" ==========")
                        .append(System.lineSeparator());

        for (int index = 0; index < values.length; index += 2) {
            output.append("- ")
                    .append(values[index])
                    .append(": ")
                    .append(values[index + 1])
                    .append(System.lineSeparator());
        }

        output.append("================================").append(System.lineSeparator());
        System.out.print(output);
    }

    private record PurchaseFixture(FixtureConcert concert, FixtureTicketType ticketType) {}

    private record FixtureUser(UUID id) {
        UUID getId() {
            return id;
        }
    }

    private record FixtureConcert(UUID id) {
        UUID getId() {
            return id;
        }
    }

    private record FixtureTicketType(UUID id, BigDecimal price) {
        UUID getId() {
            return id;
        }

        BigDecimal getPrice() {
            return price;
        }
    }

    private record AttemptResult(boolean success, ErrorCode errorCode) {
        static AttemptResult succeeded() {
            return new AttemptResult(true, null);
        }

        static AttemptResult failed(ErrorCode errorCode) {
            return new AttemptResult(false, errorCode);
        }
    }
}
