package com.ticketbox.module.ticket.application;

import com.ticketbox.module.auth.domain.User;
import com.ticketbox.module.auth.domain.UserRepository;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.domain.TicketType;
import com.ticketbox.module.concert.domain.TicketTypeRepository;
import com.ticketbox.module.ticket.domain.Order;
import com.ticketbox.module.ticket.domain.OrderItemRepository;
import com.ticketbox.module.ticket.domain.OrderRepository;
import com.ticketbox.module.ticket.web.dto.CreateOrderRequest;
import com.ticketbox.module.ticket.web.dto.OrderItemRequest;
import com.ticketbox.module.queue.application.WaitingRoomService;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

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

import static org.assertj.core.api.Assertions.assertThat;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
        "spring.task.scheduling.enabled=false",
        "spring.datasource.hikari.data-source-properties.socketTimeout=5",
        "ticketbox.payment.reconciliation-interval-ms=3600000",
        "spring.rabbitmq.listener.simple.auto-startup=false",
        "spring.batch.jdbc.initialize-schema=always",
        "ticketbox.queue.admission-capacity=100",
        "ticketbox.queue.global-admission-capacity=1000",
        "ticketbox.queue.admission-rate=10000",
        "ticketbox.queue.admission-burst=10000",
        "ticketbox.queue.global-admission-rate=10000",
        "ticketbox.queue.global-admission-burst=10000",
        "ticketbox.security.jwt.secret=phase1-test-fixture-secret-with-at-least-sixty-four-characters-local-only"
        }
)
@ActiveProfiles("test")
@Testcontainers
class OrderConcurrencyIntegrationTest {

    @Autowired private com.ticketbox.module.ticket.PaymentWorkflowPort workflow;

    private com.ticketbox.shared.payment.PaymentResult money(com.ticketbox.shared.payment.PaymentIntent intent,UUID event) {
        return new com.ticketbox.shared.payment.PaymentResult(1,event,intent.intentId(),intent.orderId(),intent.userId(),intent.provider(),
                intent.requestId(),intent.amount(),intent.currency(),intent.orderVersion(),"workflow-"+intent.intentId(),OffsetDateTime.now());
    }
    @Test void paymentWorkflowConcurrentIntentAndReceiptIssueOneTicket() throws Exception {
        var fixture=createFixture(10,4);var user=createAudienceUsers(1).getFirst();var order=createPaymentOrder(fixture,user);
        var ids=java.util.concurrent.ConcurrentHashMap.<UUID>newKeySet();
        runConcurrently(12,n->{ids.add(workflow.prepare(order,user.getId(),"MOCK").intentId());return AttemptResult.succeeded();});
        assertThat(ids).hasSize(1);var intent=workflow.prepare(order,user.getId(),"MOCK");var result=money(intent,UUID.randomUUID());
        runConcurrently(12,n->{assertThat(workflow.receive(result).decision()).isEqualTo("ACCEPTED");return AttemptResult.succeeded();});
        assertThat(inventoryJdbc.queryForObject("SELECT count(*) FROM ticketing_payment_inbox WHERE intent_id=?",Integer.class,intent.intentId())).isEqualTo(1);
        assertThat(inventoryJdbc.queryForObject("SELECT count(*) FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=?",Integer.class,order)).isEqualTo(1);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(9);
    }
    @Test void paymentWorkflowRejectsMismatchedMoneyWithoutPoisoningInbox() {
        var fixture=createFixture(10,4);var user=createAudienceUsers(1).getFirst();var order=createPaymentOrder(fixture,user);
        var i=workflow.prepare(order,user.getId(),"MOCK");var event=UUID.randomUUID();var valid=money(i,event);
        var bad=new com.ticketbox.shared.payment.PaymentResult(1,event,i.intentId(),order,user.getId(),"MOCK",i.requestId(),i.amount().add(BigDecimal.ONE),"VND",1,valid.transactionId(),OffsetDateTime.now());
        org.assertj.core.api.Assertions.assertThatThrownBy(()->workflow.receive(bad)).isInstanceOf(AppException.class);
        assertThat(inventoryJdbc.queryForObject("SELECT count(*) FROM ticketing_payment_inbox WHERE event_id=?",Integer.class,event)).isZero();
        assertThat(workflow.receive(valid).decision()).isEqualTo("ACCEPTED");
    }
    @Test void paymentWorkflowLateMoneyCannotResurrectCancelledStock() {
        var fixture=createFixture(10,4);var user=createAudienceUsers(1).getFirst();var order=createPaymentOrder(fixture,user);
        var i=workflow.prepare(order,user.getId(),"MOCK");orderService.cancelOrder(order,user.getId());
        var result=money(i,UUID.randomUUID());assertThat(workflow.receive(result).decision()).isEqualTo("REJECTED");
        assertThat(workflow.receive(result).decision()).isEqualTo("REJECTED");
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(10);
        assertThat(inventoryJdbc.queryForObject("SELECT count(*) FROM tickets WHERE concert_id=?",Integer.class,fixture.concert().getId())).isZero();
    }
    @Test void paymentWorkflowStaleDispatchCannotOverwriteSettlement() {
        var fixture=createFixture(10,4);var user=createAudienceUsers(1).getFirst();var order=createPaymentOrder(fixture,user);
        var i=workflow.prepare(order,user.getId(),"MOCK");
        var old=workflow.claim(200).stream().filter(c->c.intent().intentId().equals(i.intentId())).findFirst().orElseThrow();
        inventoryJdbc.update("UPDATE ticketing_payment_intents SET lease_until=now()-interval '1 second' WHERE order_id=?",order);
        var current=workflow.claim(200).stream().filter(c->c.intent().intentId().equals(i.intentId())).findFirst().orElseThrow();
        var snapshot=new com.ticketbox.shared.payment.PaymentSnapshot(UUID.randomUUID(),"READY","https://fixture.local/pay",i.requestId());
        workflow.snapshot(old,snapshot);assertThat(workflow.owned(order,user.getId()).snapshot().state()).isEqualTo("PROCESSING");
        workflow.receive(money(i,UUID.randomUUID()));workflow.snapshot(current,snapshot);
        assertThat(workflow.owned(order,user.getId()).snapshot().state()).isEqualTo("SUCCEEDED");
    }

    @Autowired private com.ticketbox.module.inventory.InventoryPort inventory;
    @Autowired private org.springframework.jdbc.core.JdbcTemplate inventoryJdbc;

    @Test
    void ticketingAuthorityFencesLegacyStockAndRejectsAllocatedResize() {
        var fixture=createFixture(10,4); var id=fixture.ticketType().getId();
        assertThat(inventory.reserve(id,2)).isTrue();
        assertThat(inventory.available(id)).isEqualTo(8);
        assertThat(inventoryJdbc.queryForObject("SELECT available_qty FROM ticket_types WHERE id=?",Integer.class,id)).isEqualTo(10);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> inventoryJdbc.update("UPDATE ticket_types SET available_qty=9 WHERE id=?",id))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> inventory.resizePristine(id,20)).isInstanceOf(AppException.class);
        assertThat(inventory.available(id)).isEqualTo(8);
        inventory.release(id,2);
        assertThat(inventory.available(id)).isEqualTo(10);
        inventory.setActive(id,false);assertThat(inventory.reserve(id,1)).isFalse();inventory.setActive(id,true);
    }
    @Autowired private ReservationService reservations;
    @Autowired private com.ticketbox.module.ticket.domain.TicketHoldRepository holds;
    @Autowired private com.ticketbox.module.notification.application.EmailDeliveryClaims emailClaims;
    @Autowired private com.ticketbox.module.notification.domain.NotificationRepository notifications;
    @Autowired private com.ticketbox.module.ai.application.ArtistBioJobProcessor bioProcessor;
    @Autowired private com.ticketbox.module.ai.domain.ArtistPdfJobRepository bioJobs;
    @Autowired private org.springframework.context.ApplicationEventPublisher domainEvents;
    @org.springframework.boot.test.mock.mockito.SpyBean
    private com.ticketbox.infrastructure.rabbitmq.ConfirmedMessagePublisher confirmedPublisher;

    @Test
    void notificationBrokerCallDoesNotHoldTheListenerDbTransaction() throws Exception {
        var fixture=createFixture(20,4); var buyer=createAudienceUsers(1).getFirst(); var orderId=createPaymentOrder(fixture,buyer);
        orderService.handlePaymentSuccess(orderId,"MOCK","test-broker-ref");
        var event=new com.ticketbox.shared.event.PaymentCompletedEvent(UUID.randomUUID(),orderId,buyer.getId(),
                "MOCK","test-broker-ref",fixture.ticketType().getPrice(),OffsetDateTime.now());
        var called=new CountDownLatch(1); var active=new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(call -> {
            active.set(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            called.countDown(); return null;
        }).when(confirmedPublisher).publish(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.eq(event),org.mockito.ArgumentMatchers.anyString());
        new org.springframework.transaction.support.TransactionTemplate(transactionManager).executeWithoutResult(status -> domainEvents.publishEvent(event));
        assertThat(called.await(8,TimeUnit.SECONDS)).isTrue();
        assertThat(active.get()).isFalse();
    }

    @Test
    void explicitLeaveCommitsItsPublicationAndReleasesHeldStockPromptly() {
        var fixture=createFixture(20,4); var buyer=createAudienceUsers(1).getFirst(); var token=admit(fixture,buyer);
        reservations.reserve(fixture.concert().getId(),fixture.ticketType().getId(),2,buyer.getId(),token);
        waitingRoomService.leave(fixture.concert().getId(),buyer.getId());
        org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(8)).untilAsserted(() -> {
            assertThat(holds.findByUserIdAndConcertId(buyer.getId(),fixture.concert().getId())).isEmpty();
            assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(20);
        });
    }

    @Test
    void concurrentBioWorkersClaimOnceAndOldGenerationCannotFinishRetry() throws Exception {
        var fixture=createFixture(10,4); var organizer=createUser("bio-organizer",User.Role.ORGANIZER);
        var job=bioJobs.saveAndFlush(new com.ticketbox.module.ai.domain.ArtistPdfJob(
                fixture.concert().getId(),"unused.pdf","unused.pdf",organizer.getId(),"a".repeat(64)));
        var results=runConcurrently(12,index -> org.springframework.test.util.ReflectionTestUtils.invokeMethod(bioProcessor,"start",job.getId())!=null
                ? AttemptResult.succeeded() : AttemptResult.failed(ErrorCode.INVALID_REQUEST));
        assertThat(results.stream().filter(AttemptResult::success).count()).isEqualTo(1);
        var processing=bioJobs.findById(job.getId()).orElseThrow(); var old=processing.getStartedAt();
        processing.fail("retry"); processing.resetForRetry(); bioJobs.saveAndFlush(processing);
        org.springframework.test.util.ReflectionTestUtils.invokeMethod(bioProcessor,"start",job.getId());
        org.springframework.test.util.ReflectionTestUtils.invokeMethod(bioProcessor,"complete",job.getId(),old,"Stale bio","mock","mock",10);
        assertThat(bioJobs.findById(job.getId()).orElseThrow().getStatus()).isEqualTo(com.ticketbox.module.ai.domain.ArtistPdfJob.Status.PROCESSING);
    }

    private String admit(PurchaseFixture fixture, User user) {
        waitingRoomService.join(fixture.concert().getId(),user.getId());
        waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
        return waitingRoomService.internalStatus(fixture.concert().getId(),user.getId()).queueAccessToken();
    }

    @Test
    void concurrentHoldRequestsAreSerializedByDbAndRespectQuota() throws Exception {
        var fixture=createFixture(100,4); var buyer=createAudienceUsers(1).getFirst();
        String token=admit(fixture,buyer);
        var results=runConcurrently(16,index -> {
            try { reservations.reserve(fixture.concert().getId(),fixture.ticketType().getId(),1,buyer.getId(),token); return AttemptResult.succeeded(); }
            catch (AppException failure) { return AttemptResult.failed(failure.getErrorCode()); }
        });
        assertThat(results.stream().filter(AttemptResult::success).count()).isEqualTo(4);
        assertThat(holds.findByUserIdAndConcertId(buyer.getId(),fixture.concert().getId()).getFirst().getQuantity()).isEqualTo(4);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(96);
    }

    @Test
    void concurrentCleanupCannotReturnExpiredHoldTwiceAndStaleLeaveCannotRemoveNewHold() throws Exception {
        var fixture=createFixture(20,4); var buyer=createAudienceUsers(1).getFirst();
        String old=admit(fixture,buyer);
        var hold=reservations.reserve(fixture.concert().getId(),fixture.ticketType().getId(),2,buyer.getId(),old);
        hold.setExpiresAt(OffsetDateTime.now().minusMinutes(1)); holds.saveAndFlush(hold);
        runConcurrently(12,index -> { reservations.cleanupExpiredHoldsForOwner(buyer.getId(),fixture.concert().getId()); return AttemptResult.succeeded(); });
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(20);
        waitingRoomService.leave(fixture.concert().getId(),buyer.getId());
        String current=admit(fixture,buyer);
        reservations.reserve(fixture.concert().getId(),fixture.ticketType().getId(),1,buyer.getId(),current);
        reservations.releaseHoldsForSession(buyer.getId(),fixture.concert().getId(),old);
        assertThat(holds.findByUserIdAndConcertId(buyer.getId(),fixture.concert().getId()).getFirst().getSessionToken()).isEqualTo(current);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(19);
    }

    @Test
    void conversionReleasesOmittedSkuAndRejectsDuplicateItems() {
        var fixture=createFixture(20,4); var buyer=createAudienceUsers(1).getFirst();
        String token=admit(fixture,buyer);
        var extra=new TicketType(); extra.setConcertId(fixture.concert().getId()); extra.setName("Other zone");
        extra.setPrice(BigDecimal.ONE); extra.setTotalQuantity(20); extra.setAvailableQty(20);
        extra.setMaxPerAccount(4); extra.setZoneColor("#123456"); extra.setActive(true); extra=ticketTypeRepository.saveAndFlush(extra);
        reservations.reserve(fixture.concert().getId(),extra.getId(),2,buyer.getId(),token);
        var item=new OrderItemRequest(fixture.ticketType().getId(),1);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> orderService.createOrder(
                new CreateOrderRequest(fixture.concert().getId(),List.of(item,item)),buyer.getId(),UUID.randomUUID().toString(),token)).isInstanceOf(AppException.class);
        orderService.createOrder(new CreateOrderRequest(fixture.concert().getId(),List.of(item)),buyer.getId(),UUID.randomUUID().toString(),token);
        assertThat(holds.findByUserIdAndConcertId(buyer.getId(),fixture.concert().getId())).isEmpty();
        assertThat(inventory.available(extra.getId())).isEqualTo(20);
        assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(19);
    }

    @Test
    void onlyOneReplicaCanClaimEmailAndOldOwnerCannotCompleteIt() throws Exception {
        var buyer=createAudienceUsers(1).getFirst();
        var email=notifications.saveAndFlush(com.ticketbox.module.notification.domain.Notification.createEmailNotification(
                UUID.randomUUID(),buyer.getId(),"PAYMENT_SUCCEEDED","Test","Body"));
        var owner=UUID.randomUUID();
        var results=runConcurrently(12,index -> emailClaims.claim(email.getId(),owner) ? AttemptResult.succeeded() : AttemptResult.failed(ErrorCode.INVALID_REQUEST));
        assertThat(results.stream().filter(AttemptResult::success).count()).isEqualTo(1);
        emailClaims.complete(email.getId(),UUID.randomUUID(),"SENT",null);
        assertThat(notifications.findById(email.getId()).orElseThrow().getStatus()).isEqualTo(com.ticketbox.module.notification.domain.Notification.Status.PENDING);
        emailClaims.complete(email.getId(),owner,"SENT",null);
        assertThat(notifications.findById(email.getId()).orElseThrow().getStatus()).isEqualTo(com.ticketbox.module.notification.domain.Notification.Status.SENT);
    }

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
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getFirstMappedPort());
        registry.add("spring.rabbitmq.host", rabbit::getHost);
        registry.add("spring.rabbitmq.port", rabbit::getAmqpPort);
        registry.add("spring.rabbitmq.username", rabbit::getAdminUsername);
        registry.add("spring.rabbitmq.password", rabbit::getAdminPassword);
    }

    @Autowired
    private OrderService orderService;

    @Autowired
    private WaitingRoomService waitingRoomService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ConcertRepository concertRepository;

    @Autowired
    private TicketTypeRepository ticketTypeRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired private com.ticketbox.module.payment.application.PaymentService payments;
    @Autowired private com.ticketbox.module.payment.application.PaymentAttemptTransactions paymentTx;
    @Autowired private com.ticketbox.module.payment.domain.PaymentAttemptRepository attempts;
    @Autowired private com.ticketbox.module.ticket.domain.TicketRepository tickets;
    @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;
    @org.springframework.boot.test.mock.mockito.SpyBean
    private com.ticketbox.module.payment.infrastructure.MomoPaymentGateway momo;


    @Test
    @DisplayName("Inventory 10: only 10 of 50 concurrent buyers succeed")
    void concurrentBuyersCannotOversellTheLastTickets() throws Exception {
        int initialInventory = 10;
        int buyerCount = 50;
        PurchaseFixture fixture = createFixture(initialInventory, initialInventory);
        List<User> buyers = createAudienceUsers(buyerCount);
        // All 50 buyers have already been admitted: this burst measures DB inventory arbitration.
        for (User buyer : buyers) waitingRoomService.join(fixture.concert().getId(), buyer.getId());
        while (waitingRoomService.snapshot(fixture.concert().getId()).queueSize() > 0) {
            waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
        }

        List<AttemptResult> results = runConcurrently(
                buyerCount,
                worker -> attemptOrder(
                        fixture,
                        buyers.get(worker).getId(),
                        1,
                        "oversell-" + UUID.randomUUID()
                )
        );

        long successfulOrders = results.stream().filter(AttemptResult::success).count();
        long soldOutAttempts = results.stream()
                .filter(result -> result.errorCode() == ErrorCode.TICKET_SOLD_OUT)
                .count();
        TicketType reloadedType = ticketTypeRepository.findById(fixture.ticketType().getId()).orElseThrow();
        int storedQuantity = activeQuantity(fixture.ticketType().getId());

        printResult(
                "OVERSELL PROTECTION",
                "Initial inventory", initialInventory,
                "Concurrent buyers", buyerCount,
                "Successful orders", successfulOrders,
                "Sold-out requests", soldOutAttempts,
                "Stored order quantity", storedQuantity,
                "Remaining inventory", inventory.available(reloadedType.getId())
        );

        assertThat(successfulOrders).isEqualTo(initialInventory);
        assertThat(soldOutAttempts).isEqualTo(buyerCount - initialInventory);
        assertThat(inventory.available(reloadedType.getId())).isZero();
        assertThat(storedQuantity).isEqualTo(initialInventory);
        assertThat(inventory.available(reloadedType.getId()) + storedQuantity).isEqualTo(initialInventory);
    }

    @Test
    @DisplayName("One account cannot exceed max_per_account under concurrent requests")
    void concurrentRequestsFromOneAccountCannotExceedMaxPerAccount() throws Exception {
        int maxPerAccount = 2;
        int requestCount = 20;
        PurchaseFixture fixture = createFixture(100, maxPerAccount);
        User buyer = createAudienceUsers(1).getFirst();

        List<AttemptResult> results = runConcurrently(
                requestCount,
                worker -> attemptOrder(
                        fixture,
                        buyer.getId(),
                        maxPerAccount,
                        "account-limit-" + worker + "-" + UUID.randomUUID()
                )
        );

        TicketType reloadedType = ticketTypeRepository.findById(fixture.ticketType().getId()).orElseThrow();
        int userQuantity = orderItemRepository.sumQuantityByUserIdAndTicketTypeId(
                buyer.getId(),
                fixture.ticketType().getId(),
                List.of(Order.Status.AWAITING_PAYMENT, Order.Status.PAID)
        );
        long successfulOrders = results.stream().filter(AttemptResult::success).count();
        long rejectedByBusyLock = results.stream()
                .filter(result -> result.errorCode() == ErrorCode.INVALID_REQUEST)
                .count();
        long rejectedByLimit = results.stream()
                .filter(result -> result.errorCode() == ErrorCode.TICKET_LIMIT_EXCEEDED)
                .count();

        printResult(
                "MAX PER ACCOUNT",
                "Configured limit", maxPerAccount,
                "Concurrent requests", requestCount,
                "Quantity per request", maxPerAccount,
                "Successful orders", successfulOrders,
                "Rejected by active lock", rejectedByBusyLock,
                "Rejected by account limit", rejectedByLimit,
                "Final user quantity", userQuantity,
                "Remaining inventory", inventory.available(reloadedType.getId())
        );

        assertThat(successfulOrders).isEqualTo(1);
        assertThat(userQuantity).isEqualTo(maxPerAccount);
        assertThat(inventory.available(reloadedType.getId())).isEqualTo(100 - maxPerAccount);
        assertThat(results)
                .allSatisfy(result -> {
                    if (!result.success()) {
                        assertThat(result.errorCode())
                                // The winner commits and consumes its admission session. A losing
                                // request may reach validation after that commit and be forbidden.
                                .isIn(ErrorCode.INVALID_REQUEST, ErrorCode.TICKET_LIMIT_EXCEEDED, ErrorCode.UNAUTHORIZED);
                    }
                });
    }

    @Test
    @DisplayName("Concurrent requests sharing one idempotency key create one order")
    void concurrentDuplicateIdempotencyKeysCreateOnlyOneOrder() throws Exception {
        int requestCount = 20;
        PurchaseFixture fixture = createFixture(20, 20);
        User buyer = createAudienceUsers(1).getFirst();
        String sharedKey = "duplicate-" + UUID.randomUUID();

        List<AttemptResult> results = runConcurrently(
                requestCount,
                worker -> attemptOrder(fixture, buyer.getId(), 1, sharedKey)
        );

        TicketType reloadedType = ticketTypeRepository.findById(fixture.ticketType().getId()).orElseThrow();
        List<Order> userOrders = orderRepository.findByUserIdOrderByCreatedAtDesc(buyer.getId());
        int storedQuantity = orderItemRepository.sumQuantityByUserIdAndTicketTypeId(
                buyer.getId(),
                fixture.ticketType().getId(),
                List.of(Order.Status.AWAITING_PAYMENT, Order.Status.PAID)
        );
        long successfulOrders = results.stream().filter(AttemptResult::success).count();
        long duplicateRequests = results.stream()
                .filter(result -> result.errorCode() == ErrorCode.DUPLICATE_IDEMPOTENCY_KEY)
                .count();

        printResult(
                "IDEMPOTENCY",
                "Concurrent requests", requestCount,
                "Shared idempotency key", sharedKey,
                "Successful requests", successfulOrders,
                "Duplicate requests rejected", duplicateRequests,
                "Orders stored", userOrders.size(),
                "Stored ticket quantity", storedQuantity,
                "Remaining inventory", inventory.available(reloadedType.getId())
        );

        assertThat(successfulOrders).isEqualTo(1);
        assertThat(userOrders).hasSize(1);
        assertThat(storedQuantity).isEqualTo(1);
        assertThat(inventory.available(reloadedType.getId())).isEqualTo(19);
        assertThat(results)
                .allSatisfy(result -> {
                    if (!result.success()) {
                        assertThat(result.errorCode()).isEqualTo(ErrorCode.DUPLICATE_IDEMPOTENCY_KEY);
                    }
                });
    }

    @Test
    void slowGatewayReleasesDbLockAndEarlyDuplicateCallbackSettlesOnce() throws Exception {
        var fixture = createFixture(2,2); User buyer = createUser("buyer",User.Role.AUDIENCE);
        UUID orderId = createPaymentOrder(fixture,buyer);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        org.mockito.Mockito.doAnswer(call -> {
                    assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
                    entered.countDown(); assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();
                    return new com.ticketbox.module.payment.application.gateway.PaymentInitiationResult(
                            com.ticketbox.module.payment.domain.PaymentLog.Provider.MOMO,"https://fake.local/pay",call.getArgument(1),"{}");
                }).when(momo).initiatePayment(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString());
        try (var threads = Executors.newFixedThreadPool(8)) {
            var first = threads.submit(() -> payments.initiatePayment(orderId,"MOMO",buyer.getId()));
            assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();
            long started = System.nanoTime();
            var unlocked = threads.submit(() -> new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                    .execute(status -> orderRepository.findByIdForUpdate(orderId).orElseThrow().getId()));
            assertThat(unlocked.get(1,TimeUnit.SECONDS)).isEqualTo(orderId);
            var duplicate = payments.initiatePayment(orderId,"MOMO",buyer.getId());
            assertThat(duplicate.attemptState()).isEqualTo("PROCESSING");
            var attempt = attempts.findByOrderId(orderId).orElseThrow();
            var receipt = new com.ticketbox.module.payment.application.gateway.PaymentWebhookResult(true,true,orderId,
                    "remote-txn",attempt.getAmount(),"{}",null);
            var callbacks = new ArrayList<java.util.concurrent.Callable<String>>();
            for (int i=0;i<20;i++) callbacks.add(() -> paymentTx.receive(attempt.getProvider(),receipt,attempt.getRequestId()).responseCode());
            var outcomes = new ArrayList<String>();
            for (var result : threads.invokeAll(callbacks)) outcomes.add(result.get(5,TimeUnit.SECONDS));
            assertThat(outcomes.stream().filter("00"::equals).count()).isEqualTo(1);
            assertThat(outcomes.stream().filter("02"::equals).count()).isEqualTo(19);
            release.countDown();
            assertThat(first.get(5,TimeUnit.SECONDS).attemptState()).isEqualTo("SUCCEEDED");
            assertThat(orderRepository.findById(orderId).orElseThrow().getStatus()).isEqualTo(Order.Status.PAID);
            assertThat(tickets.findByOrderId(orderId)).hasSize(1);
            assertThat(attempts.findByOrderId(orderId).orElseThrow().getState().name()).isEqualTo("SUCCEEDED");
            org.mockito.Mockito.verify(momo,org.mockito.Mockito.times(1)).initiatePayment(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString());
            System.out.println("PHASE2_EARLY_CALLBACK_OK elapsed_ms=" + (System.nanoTime()-started)/1_000_000);
        } finally { release.countDown(); }
    }

    @Test
    void ambiguousTimeoutKeepsIdentityAndReconciliationRecoversMoney() {
        var fixture = createFixture(2,2); User buyer = createUser("buyer",User.Role.AUDIENCE);
        UUID orderId = createPaymentOrder(fixture,buyer);
        org.mockito.Mockito.doThrow(new RuntimeException("response lost after provider accepted"))
                .when(momo).initiatePayment(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString());
        var first = payments.initiatePayment(orderId,"MOMO",buyer.getId());
        var retry = payments.initiatePayment(orderId,"MOMO",buyer.getId());
        assertThat(first.attemptState()).isEqualTo("UNKNOWN"); assertThat(retry.attemptId()).isEqualTo(first.attemptId());
        assertThat(retry.providerRef()).isEqualTo(first.providerRef());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> payments.initiatePayment(orderId,"VNPAY",buyer.getId()))
                .isInstanceOf(AppException.class);
        var attempt = attempts.findByOrderId(orderId).orElseThrow();
        attempt.setNextQueryAt(OffsetDateTime.now().minusSeconds(1)); attempts.saveAndFlush(attempt);
        var claims = paymentTx.claimQueries(2); var claim = claims.stream().filter(c -> c.orderId().equals(orderId)).findFirst().orElseThrow();
        paymentTx.finishQuery(claim,new com.ticketbox.module.payment.application.gateway.PaymentQueryResult(true,true,
                "queried-txn",attempt.getAmount(),"{}"));
        assertThat(orderRepository.findById(orderId).orElseThrow().getStatus()).isEqualTo(Order.Status.PAID);
        assertThat(tickets.findByOrderId(orderId)).hasSize(1);
        paymentTx.finishQuery(claim,new com.ticketbox.module.payment.application.gateway.PaymentQueryResult(true,true,
                "queried-txn",attempt.getAmount(),"{}"));
        assertThat(tickets.findByOrderId(orderId)).hasSize(1);
        org.mockito.Mockito.verify(momo,org.mockito.Mockito.times(1)).initiatePayment(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void successAfterExpiryOrCancellationPreservesReceiptWithoutTickets() {
        for (boolean cancel : List.of(false,true)) {
            var fixture = createFixture(2,2); User buyer = createUser("buyer",User.Role.AUDIENCE);
            UUID orderId = createPaymentOrder(fixture,buyer);
            payments.initiatePayment(orderId,"MOCK",buyer.getId());
            if (cancel) orderService.cancelOrder(orderId,buyer.getId());
            else {
                var order = orderRepository.findById(orderId).orElseThrow();
                order.setExpiresAt(OffsetDateTime.now().minusSeconds(1)); orderRepository.saveAndFlush(order);
            }
            payments.processMockPaymentSuccess(orderId);
            payments.processMockPaymentSuccess(orderId);
            assertThat(tickets.findByOrderId(orderId)).isEmpty();
            assertThat(attempts.findByOrderId(orderId).orElseThrow().getState().name()).isEqualTo("RECONCILIATION_REQUIRED");
            assertThat(inventory.available(fixture.ticketType().getId())).isEqualTo(2);
        }
    }

    private UUID createPaymentOrder(PurchaseFixture fixture, User buyer) {
        waitingRoomService.join(fixture.concert().getId(),buyer.getId());
        waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
        String token = waitingRoomService.internalStatus(fixture.concert().getId(),buyer.getId()).queueAccessToken();
        return orderService.createOrder(new CreateOrderRequest(fixture.concert().getId(),
                List.of(new OrderItemRequest(fixture.ticketType().getId(),1))),buyer.getId(),UUID.randomUUID().toString(),token).id();
    }

    private AttemptResult attemptOrder(
            PurchaseFixture fixture,
            UUID userId,
            int quantity,
            String idempotencyKey
    ) {
        CreateOrderRequest request = new CreateOrderRequest(
                fixture.concert().getId(),
                List.of(new OrderItemRequest(fixture.ticketType().getId(), quantity))
        );

        try {
            waitingRoomService.join(fixture.concert().getId(), userId);
            // Admission is explicit; high test budgets isolate inventory/quota races from rate policy.
            waitingRoomService.promoteWaitingUsers(fixture.concert().getId());
            String queueAccessToken = waitingRoomService.internalStatus(fixture.concert().getId(), userId).queueAccessToken();
            orderService.createOrder(request, userId, idempotencyKey, queueAccessToken);
            return AttemptResult.succeeded();
        } catch (AppException exception) {
            return AttemptResult.failed(exception.getErrorCode());
        }
    }

    private PurchaseFixture createFixture(int inventory, int maxPerAccount) {
        User organizer = createUser("organizer", User.Role.ORGANIZER);

        Concert concert = new Concert();
        concert.setTitle("Concurrency proof " + UUID.randomUUID());
        concert.setVenueName("Test venue");
        concert.setVenueAddress("Test address");
        concert.setEventDate(OffsetDateTime.now().plusDays(30));
        concert.setDoorsOpenAt(OffsetDateTime.now().plusDays(30).minusHours(1));
        concert.setSaleStartAt(OffsetDateTime.now().minusHours(1));
        concert.setSaleEndAt(OffsetDateTime.now().plusDays(1));
        concert.setStatus(Concert.Status.ON_SALE);
        concert.setCreatedBy(organizer.getId());
        concert = concertRepository.saveAndFlush(concert);

        TicketType ticketType = new TicketType();
        ticketType.setConcertId(concert.getId());
        ticketType.setName("Concurrency zone");
        ticketType.setPrice(BigDecimal.valueOf(1_000_000));
        ticketType.setTotalQuantity(inventory);
        ticketType.setAvailableQty(inventory);
        ticketType.setMaxPerAccount(maxPerAccount);
        ticketType.setZoneColor("#123456");
        ticketType.setActive(true);
        ticketType = ticketTypeRepository.saveAndFlush(ticketType);

        // Order races require a READY sale queue. Draw contention is tested separately:
        // it returns a retryable 503 instead of tying up all request threads.
        UUID preparationUser = UUID.randomUUID();
        waitingRoomService.join(concert.getId(), preparationUser);
        waitingRoomService.finishShoppingSession(concert.getId(), preparationUser);
        return new PurchaseFixture(concert, ticketType);
    }

    private List<User> createAudienceUsers(int count) {
        List<User> users = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            users.add(createUser("buyer-" + i, User.Role.AUDIENCE));
        }
        return users;
    }

    private User createUser(String prefix, User.Role role) {
        User user = new User();
        user.setEmail(prefix + "-" + UUID.randomUUID() + "@ticketbox.test");
        user.setFullName("Concurrency Test User");
        user.setPasswordHash("not-used");
        user.setRole(role);
        user.setActive(true);
        return userRepository.saveAndFlush(user);
    }

    private int activeQuantity(UUID ticketTypeId) {
        return orderItemRepository.findAll().stream()
                .filter(item -> item.getTicketTypeId().equals(ticketTypeId))
                .mapToInt(item -> item.getQuantity())
                .sum();
    }

    private List<AttemptResult> runConcurrently(
            int workerCount,
            IntFunction<AttemptResult> action
    ) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(workerCount);
        CountDownLatch ready = new CountDownLatch(workerCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<AttemptResult>> futures = new ArrayList<>(workerCount);

        try {
            for (int worker = 0; worker < workerCount; worker++) {
                int workerIndex = worker;
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("Timed out waiting for concurrent start");
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
        StringBuilder output = new StringBuilder()
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

        output.append("================================")
                .append(System.lineSeparator());
        System.out.print(output);
    }

    private record PurchaseFixture(Concert concert, TicketType ticketType) {
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
