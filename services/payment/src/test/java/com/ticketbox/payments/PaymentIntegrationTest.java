package com.ticketbox.payments;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.ticketbox.payments.application.PaymentFacade;
import com.ticketbox.payments.application.PaymentSettlementService;
import com.ticketbox.payments.application.dto.PaymentContract.*;
import com.ticketbox.payments.application.error.AppException;
import com.ticketbox.payments.domain.OrderView;
import com.ticketbox.payments.domain.PaymentQueryResult;
import com.ticketbox.payments.domain.PaymentWebhookResult;
import com.ticketbox.payments.domain.Provider;
import com.ticketbox.payments.infrastructure.persistence.PaymentStore;
import com.ticketbox.payments.infrastructure.provider.MockPaymentGateway;
import com.ticketbox.payments.infrastructure.provider.PaymentGatewayResolver;
import com.ticketbox.payments.infrastructure.worker.PaymentReconciliationPublisher;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

@SpringBootTest(
        properties = {"payment.worker-interval-ms=3600000", "payment.query-interval-ms=3600000",
                "payment.reconciliation-interval-ms=3600000"})
@AutoConfigureMockMvc
@Testcontainers
@DirtiesContext
class PaymentIntegrationTest {
    static final String TOKEN = "phase3-service-test-token-at-least-thirty-two-characters";

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    static final AtomicInteger coreStatus = new AtomicInteger(200);
    static final AtomicReference<String> decision = new AtomicReference<>("ACCEPTED");
    static final AtomicInteger reportStatus = new AtomicInteger(204);
    static final AtomicReference<com.fasterxml.jackson.databind.JsonNode> reported = new AtomicReference<>();
    static final HttpServer core = startCore();

    static HttpServer startCore() {
        try {
            var http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            http.createContext(
                    "/internal/ticketing/payment-results",
                    request -> {
                        var json = new ObjectMapper();
                        var body = json.readTree(request.getRequestBody());
                        int status =
                                TOKEN.equals(
                                                request.getRequestHeaders()
                                                        .getFirst("X-Service-Token"))
                                        ? coreStatus.get()
                                        : 401;
                        var bytes =
                                json.writeValueAsBytes(
                                        Map.of(
                                                "eventId",
                                                body.path("eventId").asText(),
                                                "decision",
                                                decision.get(),
                                                "reason",
                                                "Fixture ACK"));
                        request.getResponseHeaders().set("Content-Type", "application/json");
                        request.sendResponseHeaders(status, bytes.length);
                        request.getResponseBody().write(bytes);
                        request.close();
                    });
            http.createContext("/internal/ticketing/payment-reconciliation", request -> {
                if (!TOKEN.equals(request.getRequestHeaders().getFirst("X-Service-Token"))) {
                    request.sendResponseHeaders(401, -1);
                } else {
                    reported.set(new ObjectMapper().readTree(request.getRequestBody()));
                    request.sendResponseHeaders(reportStatus.get(), -1);
                }
                request.close();
            });
            http.start();
            return http;
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", postgres::getJdbcUrl);
        p.add("spring.datasource.username", postgres::getUsername);
        p.add("spring.datasource.password", postgres::getPassword);
        p.add("payment.core-url", () -> "http://127.0.0.1:" + core.getAddress().getPort());
        p.add("payment.service-token", () -> TOKEN);
    }

    @Autowired PaymentFacade facade;
    @Autowired PaymentStore store;
    @Autowired PaymentSettlementService workers;
    @Autowired PaymentReconciliationPublisher reconciliation;
    @Autowired com.ticketbox.payments.application.port.RefundCases refunds;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc api;
    @Autowired ObjectMapper json;
    @SpyBean MockPaymentGateway gateway;

    @BeforeEach
    void clear() {
        db.execute("TRUNCATE payment_audit,refund_reviews,payment_result_outbox,payment_reconciliation_outbox,refund_result_outbox,payment_attempts");
        coreStatus.set(200);
        decision.set("ACCEPTED");
        reportStatus.set(204);
        reported.set(null);
    }

    @AfterAll
    static void close(
            @Autowired
                    org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor
                            tasks) {
        tasks.destroy();
        core.stop(0);
    }

    Intent intent() {
        UUID id = UUID.randomUUID();
        return new Intent(
                1,
                id,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "MOCK",
                BigDecimal.valueOf(250000),
                "VND",
                OffsetDateTime.now().plusMinutes(10),
                1,
                id.toString(),
                id.toString());
    }

    void money(Intent i) {
        facade.mock(i.orderId(), true);
    }

    String state(Intent i) {
        return store.find(i.orderId()).state();
    }

    @Test
    void concurrentCreateIsImmutableAndGatewayRunsOutsideDatabaseTransaction() throws Exception {
        var i = intent();
        var active = new AtomicBoolean(true);
        var calls = new AtomicInteger();
        doAnswer(
                        call -> {
                            calls.incrementAndGet();
                            active.set(
                                    org.springframework.transaction.support
                                            .TransactionSynchronizationManager
                                            .isActualTransactionActive());
                            return call.callRealMethod();
                        })
                .when(gateway)
                .initiatePayment(any(OrderView.class), anyString());
        var pool = Executors.newFixedThreadPool(8);
        try {
            var work = new ArrayList<Future<Snapshot>>();
            for (int n = 0; n < 8; n++) work.add(pool.submit(() -> facade.submit(i)));
            for (var task : work) task.get(20, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(calls.get()).isEqualTo(1);
        assertThat(active.get()).isFalse();
        assertThat(state(i)).isEqualTo("READY");
        var changed =
                new Intent(
                        1,
                        i.intentId(),
                        i.orderId(),
                        i.userId(),
                        "MOCK",
                        BigDecimal.ONE,
                        "VND",
                        i.expiresAt(),
                        1,
                        i.requestId(),
                        i.correlationId());
        assertThatThrownBy(() -> facade.submit(changed))
                .isInstanceOf(com.ticketbox.payments.application.error.PaymentRejection.class);
        assertThat(db.queryForObject("SELECT count(*) FROM payment_attempts", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void reusedIntentOrRequestIdentityOnAnotherOrderReturnsConflict() {
        var original = intent();
        facade.submit(original);
        var sameIntent =
                new Intent(
                        1,
                        original.intentId(),
                        UUID.randomUUID(),
                        original.userId(),
                        "MOCK",
                        original.amount(),
                        "VND",
                        original.expiresAt(),
                        1,
                        UUID.randomUUID().toString(),
                        original.correlationId());
        var sameRequest =
                new Intent(
                        1,
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        original.userId(),
                        "MOCK",
                        original.amount(),
                        "VND",
                        original.expiresAt(),
                        1,
                        original.requestId(),
                        original.correlationId());
        for (var collision : List.of(sameIntent, sameRequest)) {
            assertThatThrownBy(() -> facade.submit(collision))
                    .isInstanceOfSatisfying(
                            com.ticketbox.payments.application.error.PaymentRejection.class,
                            error ->
                                    assertThat(error.kind())
                                            .isEqualTo(
                                                    com.ticketbox.payments.application.error
                                                            .PaymentRejection.Kind
                                                            .IDENTITY_CONFLICT));
        }
        assertThat(db.queryForObject("SELECT count(*) FROM payment_attempts", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void coreOutageAndReceiptReplayRetainDurableResultUntilAck() {
        var i = intent();
        facade.submit(i);
        money(i);
        money(i);
        coreStatus.set(503);
        workers.results();
        assertThat(state(i)).isEqualTo("SETTLEMENT_PENDING");
        assertThat(db.queryForObject("SELECT count(*) FROM payment_result_outbox", Integer.class))
                .isEqualTo(1);
        assertThat(db.queryForObject("SELECT attempts FROM payment_result_outbox", Integer.class))
                .isEqualTo(1);
        coreStatus.set(200);
        db.update("UPDATE payment_result_outbox SET next_attempt_at=now()");
        workers.results();
        assertThat(state(i)).isEqualTo("SUCCEEDED");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM payment_result_outbox WHERE completed_at IS"
                                        + " NULL",
                                Integer.class))
                .isZero();
    }

    @Test
    void lostLeaseCannotAcknowledgeAnotherWorkerResult() {
        var i = intent();
        facade.submit(i);
        money(i);
        var first = store.claimResults(1).getFirst();
        db.update("UPDATE payment_result_outbox SET lease_until=now()-interval '1 second'");
        var second = store.claimResults(1).getFirst();
        store.acknowledged(first, new Ack(first.id(), "ACCEPTED", "ok"));
        assertThat(state(i)).isEqualTo("SETTLEMENT_PENDING");
        store.acknowledged(second, new Ack(second.id(), "ACCEPTED", "ok"));
        assertThat(state(i)).isEqualTo("SUCCEEDED");
    }

    @Test
    void rejectionCreatesStableCompensationCaseAndAuditedManualResolution() {
        var i = intent();
        facade.submit(i);
        money(i);
        decision.set("REJECTED");
        workers.results();
        money(i);
        assertThat(state(i)).isEqualTo("RECONCILIATION_REQUIRED");
        assertThat(db.queryForObject("SELECT count(*) FROM refund_reviews", Integer.class))
                .isEqualTo(1);
        UUID caseId = db.queryForObject("SELECT request_id FROM refund_reviews", UUID.class),
                action = UUID.randomUUID(),
                actor = UUID.randomUUID(), approver = UUID.randomUUID();
        assertThatThrownBy(() -> store.review(i.orderId(), action, actor, "RECORD_MANUAL_REFUND",
                "External fixture refund reference", caseId)).isInstanceOf(com.ticketbox.payments.application.error.PaymentRejection.class);
        var requested = refunds.apply(i.orderId(), refund(UUID.randomUUID(), actor, caseId, "REQUEST", null, null));
        assertThat(requested.id()).isEqualTo(caseId);
        assertThatThrownBy(() -> refunds.apply(i.orderId(), refund(UUID.randomUUID(), actor, caseId, "BEGIN_APPROVAL", null, null)))
                .isInstanceOf(com.ticketbox.payments.application.error.PaymentRejection.class);
        refunds.apply(i.orderId(), refund(UUID.randomUUID(), approver, caseId, "BEGIN_APPROVAL", null, null));
        refunds.apply(i.orderId(), refund(UUID.randomUUID(), approver, caseId, "APPROVE", null, null));
        var confirmed = refund(action, actor, caseId, "CONFIRM", 250000L, "External fixture refund reference");
        assertThat(refunds.apply(i.orderId(), confirmed)).isEqualTo(refunds.apply(i.orderId(), confirmed));
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM payment_audit WHERE id=? AND actor_id=?",
                                Integer.class,
                                action,
                                actor))
                .isEqualTo(1);
        assertThat(db.queryForObject("SELECT state FROM refund_reviews", String.class))
                .isEqualTo("RESOLVED_MANUALLY");
        reconciliation.publish();
        assertThat(reported.get().path("collectedAmount").asLong()).isEqualTo(250000);
        assertThat(reported.get().path("refundAmount").asLong()).isEqualTo(250000);
        assertThat(reported.get().path("refundReference").asText()).isEqualTo("External fixture refund reference");
        assertThat(db.queryForObject("SELECT count(*) FROM refund_result_outbox WHERE case_id=?", Integer.class, caseId)).isEqualTo(1);
    }

    private static com.ticketbox.payments.application.port.RefundCases.Command refund(
            UUID action, UUID actor, UUID caseId, String kind, Long amount, String reference) {
        return new com.ticketbox.payments.application.port.RefundCases.Command(action, actor, caseId,
                com.ticketbox.payments.application.port.RefundCases.Action.valueOf(kind), "Fixture reason", amount,
                reference, amount == null ? null : OffsetDateTime.now());
    }

    @Test
    void reconciliationRetriesWithoutDelayingSettlementAndSendsLatestRevision() {
        var i = intent();
        facade.submit(i);
        reportStatus.set(503);
        reconciliation.publish();
        var first = reported.get();
        assertThat(first.path("state").asText()).isEqualTo("READY");
        assertThat(db.queryForObject("SELECT delivered_revision FROM payment_reconciliation_outbox", Long.class)).isZero();
        money(i);
        workers.results();
        assertThat(state(i)).isEqualTo("SUCCEEDED");
        reportStatus.set(204);
        reconciliation.publish();
        var latest = reported.get();
        assertThat(latest.path("revision").asLong()).isGreaterThan(first.path("revision").asLong());
        assertThat(latest.path("state").asText()).isEqualTo("SUCCEEDED");
        assertThat(latest.path("verifiedAt").asText()).isNotBlank();
        assertThat(latest.path("collectedAmount").asLong()).isEqualTo(250000);
        assertThat(db.queryForObject("SELECT delivered_revision = revision FROM payment_reconciliation_outbox", Boolean.class)).isTrue();
    }

    @Test
    void ambiguousCreateNeverCallsCreateAgainAndVerifiedQueryRecoversMoney() {
        var i = intent();
        doThrow(new IllegalStateException("Response lost after submission"))
                .when(gateway)
                .initiatePayment(any(OrderView.class), anyString());
        facade.submit(i);
        facade.submit(i);
        assertThat(state(i)).isEqualTo("UNKNOWN");
        reconciliation.publish();
        assertThat(reported.get().path("state").asText()).isEqualTo("UNKNOWN");
        assertThat(reported.get().path("collectedAmount").isNull()).isTrue();
        verify(gateway, times(1)).initiatePayment(any(OrderView.class), eq(i.requestId()));
        db.update("UPDATE payment_attempts SET next_query_at=now()");
        var claim = store.claimQueries(1).getFirst();
        store.queryResult(
                claim, new PaymentQueryResult(true, true, "queried-tx", i.amount(), "{}"));
        workers.results();
        assertThat(state(i)).isEqualTo("SUCCEEDED");
    }

    @Test
    void wrongAmountAndExtraTransactionsCannotSettleButRemainReviewable() {
        var i = intent();
        facade.submit(i);
        var wrong =
                new PaymentWebhookResult(
                        true, true, i.orderId(), "wrong-amount", BigDecimal.ONE, "{}", null);
        assertThat(store.receive(Provider.MOCK, wrong, null).responseCode()).isEqualTo("04");
        assertThat(db.queryForObject("SELECT count(*) FROM payment_result_outbox", Integer.class))
                .isZero();
        money(i);
        workers.results();
        assertThat(
                        store.receive(
                                        Provider.MOCK,
                                        new PaymentWebhookResult(
                                                true,
                                                true,
                                                i.orderId(),
                                                "extra-tx",
                                                i.amount(),
                                                "{}",
                                                null),
                                        null)
                                .responseCode())
                .isEqualTo("97");
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM refund_reviews WHERE state='REVIEW_REQUIRED'",
                                Integer.class))
                .isEqualTo(2);
        assertThat(state(i)).isEqualTo("SUCCEEDED");
    }

    @Test
    void internalApiRequiresServiceCredentialAndExpiredIntentNeverCallsProvider() throws Exception {
        var i = intent();
        api.perform(
                        post("/internal/intents")
                                .contentType("application/json")
                                .content(json.writeValueAsBytes(i)))
                .andExpect(status().isUnauthorized());
        api.perform(
                        post("/internal/intents")
                                .header("X-Service-Token", TOKEN)
                                .contentType("application/json")
                                .content(json.writeValueAsBytes(i)))
                .andExpect(status().isOk());
        var expired =
                new Intent(
                        1,
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        "MOCK",
                        i.amount(),
                        "VND",
                        OffsetDateTime.now().minusMinutes(1),
                        1,
                        UUID.randomUUID().toString(),
                        "expiry");
        assertThat(facade.submit(expired).state()).isEqualTo("FAILED");
        verify(gateway, times(1)).initiatePayment(any(OrderView.class), anyString());
    }

    @Test
    void queryRedriveIsAuditedIdempotentAndKeepsRequestIdentity() {
        var i = intent();
        facade.submit(i);
        db.update(
                "UPDATE payment_attempts SET state='REVIEW_REQUIRED' WHERE order_id=?",
                i.orderId());
        var action = UUID.randomUUID();
        var actor = UUID.randomUUID();
        store.review(
                i.orderId(),
                action,
                actor,
                "REDRIVE_QUERY",
                "Provider query available again",
                null);
        store.review(
                i.orderId(),
                action,
                actor,
                "REDRIVE_QUERY",
                "Provider query available again",
                null);
        assertThat(state(i)).isEqualTo("UNKNOWN");
        assertThat(store.find(i.orderId()).intent().requestId()).isEqualTo(i.requestId());
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM payment_audit WHERE id=?",
                                Integer.class,
                                action))
                .isEqualTo(1);
    }

    @Test
    void productionResolverRejectsMockEvenIfBeanWasAccidentallyRegistered() {
        var environment = new org.springframework.mock.env.MockEnvironment();
        environment.setActiveProfiles("prod");
        var resolver = new PaymentGatewayResolver(List.of(gateway), environment);
        assertThatThrownBy(() -> resolver.resolve(Provider.MOCK)).isInstanceOf(AppException.class);
    }
}
