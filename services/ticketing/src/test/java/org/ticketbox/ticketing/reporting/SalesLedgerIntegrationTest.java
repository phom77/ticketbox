package org.ticketbox.ticketing.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.identity.UserContactPort;
import org.ticketbox.ticketing.infrastructure.integration.payment.PaymentRemoteClient;
import org.ticketbox.ticketing.order.application.OrderService;
import org.ticketbox.ticketing.order.application.RefundOrderEffects;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.reporting.application.SalesReportService;
import org.ticketbox.ticketing.reporting.application.dto.SalesReportResponses.Summary;
import org.ticketbox.ticketing.reporting.application.port.SalesLedger;
import org.ticketbox.ticketing.reporting.web.SalesReportController;
import org.ticketbox.ticketing.web.GlobalExceptionHandler;
import org.ticketbox.ticketing.web.security.OrganizationAccess;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
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
class SalesLedgerIntegrationTest {
    @Autowired private OrderService orders;
    @Autowired private RefundOrderEffects effects;
    @Autowired private SalesLedger ledger;
    @Autowired private SalesReportService reports;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private org.springframework.context.ApplicationContext context;
    @Autowired @Qualifier("serviceClient") private RestClient serviceClient;
    @MockBean private RefundProviders providers;
    @MockBean private PaymentRemoteClient payment;
    @MockBean private UserContactPort identity;

    private static final OffsetDateTime PAID = OffsetDateTime.parse("2026-12-01T03:00:00Z");
    private static final OffsetDateTime REFUNDED = OffsetDateTime.parse("2026-12-05T03:00:00Z");
    private final UUID buyer = UUID.randomUUID();

    @Test
    void aPaidOrderIsRecordedOnceEvenWhenTheResultIsReplayed() {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "AWAITING_PAYMENT");
        assertThat(orders.handlePaymentSuccess(fixture.order, "MOCK", "pay-" + fixture.order)).isTrue();
        assertThat(orders.handlePaymentSuccess(fixture.order, "MOCK", "pay-" + fixture.order)).isTrue();
        assertThat(rows(fixture.order, "SALE")).isEqualTo(1);
        assertThat(rows(fixture.order, "REFUND")).isZero();
        var row = jdbc.queryForMap("SELECT * FROM sales_ledger WHERE order_id=?", fixture.order);
        assertThat(row.get("organization_id")).isEqualTo(org);
        assertThat(row.get("event_id")).isEqualTo(fixture.concert);
        assertThat(row.get("performance_id")).isEqualTo(fixture.concert);
        assertThat(((Number) row.get("amount")).longValue()).isEqualTo(200000);
        assertThat(row.get("quantity")).isEqualTo(2);
        assertThat(row.get("offer_name")).isEqualTo("General");
        assertThat(row.get("provider")).isEqualTo("MOCK");
        assertThat(row.get("occurred_at")).isNotNull();
    }

    @Test
    void concurrentPaymentResultsRecordTheSaleOnce() throws Exception {
        var fixture = order(UUID.randomUUID(), null, "AWAITING_PAYMENT");
        var pool = java.util.concurrent.Executors.newFixedThreadPool(4);
        try {
            var calls = new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 4; i++) {
                calls.add(pool.submit(() -> orders.handlePaymentSuccess(fixture.order, "MOCK", "pay-" + fixture.order)));
            }
            for (var call : calls) {
                assertThat(call.get()).isTrue();
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(rows(fixture.order, "SALE")).isEqualTo(1);
    }

    @Test
    void aConfirmedRefundIsRecordedAtItsConfirmationTimeAndReplayChangesNothing() {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "AWAITING_PAYMENT");
        orders.handlePaymentSuccess(fixture.order, "MOCK", "pay-" + fixture.order);
        UUID caseId = UUID.randomUUID();
        var ticket = jdbc.queryForObject("SELECT t.id FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=? LIMIT 1",
                UUID.class, fixture.order);
        var all = jdbc.queryForList("SELECT t.id FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=?",
                UUID.class, fixture.order).stream().sorted().toArray(UUID[]::new);
        assertThat(ticket).isNotNull();
        jdbc.update("INSERT INTO order_refunds(case_id,order_id,ticket_ids,state,compensation) VALUES (?,?,?,'PREPARED',false)",
                caseId, fixture.order, all);
        var result = new RefundOrderEffects.Result(1, caseId, fixture.order, "CONFIRMED", 200000, "MOCK",
                "pay-" + fixture.order, "bank-" + caseId, REFUNDED, false);
        effects.apply(result);
        effects.apply(result);
        assertThat(rows(fixture.order, "SALE")).isEqualTo(1);
        assertThat(rows(fixture.order, "REFUND")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT occurred_at FROM sales_ledger WHERE order_id=? AND kind='REFUND'",
                OffsetDateTime.class, fixture.order).toInstant()).isEqualTo(REFUNDED.toInstant());
        assertThat(jdbc.queryForObject("SELECT confirmed_at FROM order_refunds WHERE case_id=?", OffsetDateTime.class,
                caseId).toInstant()).isEqualTo(REFUNDED.toInstant());
    }

    @Test
    void aCompensationRefundOfAnOrderThatWasNeverPaidWritesNothing() {
        var fixture = order(UUID.randomUUID(), null, "EXPIRED");
        UUID caseId = UUID.randomUUID();
        jdbc.update("INSERT INTO order_refunds(case_id,order_id,ticket_ids,state,compensation) VALUES (?,?,'{}','PREPARED',true)",
                caseId, fixture.order);
        effects.apply(new RefundOrderEffects.Result(1, caseId, fixture.order, "CONFIRMED", 200000, "MOCK", null,
                "bank-" + caseId, REFUNDED, true));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sales_ledger WHERE order_id=?", Integer.class, fixture.order)).isZero();
    }

    @Test
    void aRolledBackTransitionLeavesNoLedgerRow() {
        var fixture = order(UUID.randomUUID(), null, "PAID");
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            ledger.recordSale(fixture.order, "MOCK", PAID);
            throw new IllegalStateException("abort");
        })).hasMessage("abort");
        assertThat(rows(fixture.order, "SALE")).isZero();
        assertThatThrownBy(() -> ledger.recordSale(fixture.order, "MOCK", PAID))
                .isInstanceOf(org.springframework.transaction.IllegalTransactionStateException.class);
    }

    @Test
    void salesCountOnThePaymentDateAndRefundsOnTheRefundDate() {
        var org = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        var first = order(org, event, "PAID");
        var second = order(org, event, "PAID");
        var other = order(UUID.randomUUID(), null, "PAID");
        record(first, PAID, null);
        record(second, PAID.plusDays(1), REFUNDED);
        record(other, PAID, null);

        LocalDate d1 = LocalDate.of(2026, 12, 1), d5 = LocalDate.of(2026, 12, 5);
        Summary day1 = reports.summary(org, event, null, d1, d1, true);
        assertThat(day1.ticketsSold()).isEqualTo(2);
        assertThat(day1.ticketsRefunded()).isZero();
        assertThat(day1.grossSales()).isEqualTo(200000);
        assertThat(day1.provisional()).isTrue();
        assertThat(day1.capacity()).isEqualTo(20);
        Summary day5 = reports.summary(org, event, null, d5, d5, true);
        assertThat(day5.ticketsSold()).isZero();
        assertThat(day5.ticketsRefunded()).isEqualTo(2);
        assertThat(day5.refunds()).isEqualTo(200000);
        assertThat(day5.netSales()).isEqualTo(-200000);
        Summary range = reports.summary(org, event, null, d1, d5, true);
        assertThat(range.netTickets()).isEqualTo(2);
        assertThat(range.netSales()).isEqualTo(200000);
        assertThat(range.orders()).isEqualTo(2);

        // Organization scope excludes another organization's sales; event scope sums its performances.
        assertThat(reports.summary(org, null, null, d1, d5, true).ticketsSold()).isEqualTo(4);
        var performances = reports.breakdown(org, event, null, d1, d5, "performance", true);
        assertThat(performances.rows()).extracting(r -> r.performanceId())
                .containsExactlyInAnyOrder(first.concert, second.concert);
        assertThat(performances.rows().stream().mapToLong(r -> r.ticketsSold()).sum()).isEqualTo(4);
        var offers = reports.breakdown(org, event, null, d1, d5, "offer", true);
        assertThat(offers.rows()).hasSize(2).allSatisfy(r -> assertThat(r.label()).isEqualTo("General"));
        assertThatThrownBy(() -> reports.breakdown(org, null, null, d1, d5, "offer", true))
                .isInstanceOf(AppException.class);

        // Trend: one bucket per day with zero fill, and the grouping limits.
        var trend = reports.trend(org, event, null, d1, d5, "day", true);
        assertThat(trend.buckets()).hasSize(5);
        assertThat(trend.buckets().get(0).ticketsSold()).isEqualTo(2);
        assertThat(trend.buckets().get(1).ticketsSold()).isEqualTo(2);
        assertThat(trend.buckets().get(4).ticketsRefunded()).isEqualTo(2);
        assertThat(reports.trend(org, event, null, d1, d1, null, true).buckets()).hasSize(24);
        assertThatThrownBy(() -> reports.trend(org, event, null, d1, d1.plusDays(30), "hour", true))
                .isInstanceOf(AppException.class);
        assertThat(reports.trend(org, null, null, d1, d1.plusDays(400), "week", true).buckets()).isNotEmpty();

        // Money is omitted without FINANCE.
        var tickets = reports.summary(org, event, null, d1, d5, false);
        assertThat(tickets.grossSales()).isNull();
        assertThat(tickets.netSales()).isNull();
        assertThat(reports.trend(org, event, null, d1, d5, "day", false).buckets().get(0).grossSales()).isNull();

        // Reversed periods and other organizations' ids are rejected.
        assertThatThrownBy(() -> reports.summary(org, null, null, d5, d1, true))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
        UUID stranger = UUID.randomUUID();
        assertThatThrownBy(() -> reports.summary(stranger, event, null, d1, d5, true))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        assertThatThrownBy(() -> reports.summary(stranger, null, first.concert, d1, d5, true))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Test
    void grantsDecideWhichFiguresAndExportsAnOrganizerSees() throws Exception {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        record(fixture, PAID, null);
        UUID eventsOnly = UUID.randomUUID(), financeOnly = UUID.randomUUID(), both = UUID.randomUUID(), neither = UUID.randomUUID();
        Map<UUID, String> grants = Map.of(eventsOnly, "[\"EVENTS\"]", financeOnly, "[\"FINANCE\"]",
                both, "[\"EVENTS\",\"FINANCE\"]", neither, "[\"CHECKIN\"]");
        HttpServer identity = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        identity.createContext("/internal/split/v1/organization-access/", exchange -> {
            String auth = exchange.getRequestHeaders().getFirst("Authorization").substring("Bearer ".length());
            UUID account = UUID.fromString(auth);
            byte[] body = ("{\"accountId\":\"" + account + "\",\"organizationId\":\"" + org + "\",\"grants\":"
                    + grants.get(account) + "}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        identity.start();
        try {
            MockMvc web = MockMvcBuilders.standaloneSetup(context.getBean(SalesReportController.class))
                    .addInterceptors(new OrganizationAccess(serviceClient, "http://127.0.0.1:" + identity.getAddress().getPort()))
                    .setControllerAdvice(new GlobalExceptionHandler()).build();
            String query = "?from=2026-12-01&to=2026-12-05";
            var ticketsOnly = body(web, as(get("/api/organizer/sales/summary" + query), eventsOnly, org));
            assertThat(ticketsOnly).contains("\"ticketsSold\":2").doesNotContain("grossSales", "netSales", "\"refunds\"");
            assertThat(body(web, as(get("/api/organizer/sales/trend" + query), eventsOnly, org))).doesNotContain("grossSales");
            assertThat(body(web, as(get("/api/organizer/sales/summary" + query), financeOnly, org))).contains("\"grossSales\":200000");
            assertThat(body(web, as(get("/api/organizer/sales/summary" + query), both, org))).contains("\"netSales\":200000");
            assertThat(status(web, as(get("/api/organizer/sales/summary" + query), neither, org))).isEqualTo(403);
            assertThat(status(web, as(get("/api/organizer/sales/export" + query + "&format=csv"), eventsOnly, org))).isEqualTo(403);
            var csv = web.perform(as(get("/api/organizer/sales/export" + query + "&format=csv"), both, org)).andReturn().getResponse();
            assertThat(csv.getStatus()).isEqualTo(200);
            assertThat(csv.getContentAsString(StandardCharsets.UTF_8)).startsWith("﻿").contains("Net sales (VND)", "200000");
            var pdf = web.perform(as(get("/api/organizer/sales/export" + query + "&format=pdf"), both, org)).andReturn().getResponse();
            assertThat(pdf.getContentAsByteArray()).startsWith("%PDF".getBytes(StandardCharsets.US_ASCII));
            assertThat(status(web, as(get("/api/organizer/sales/summary?from=2026-12-05&to=2026-12-01"), both, org))).isEqualTo(400);
            assertThat(status(web, as(get("/api/organizer/sales/summary" + query + "&eventId=" + UUID.randomUUID()), both, org)))
                    .isEqualTo(404);

            // The event picker works from Ticketing's own data for any member with EVENTS or FINANCE, in one organization.
            UUID nativeEvent = UUID.randomUUID();
            var nativeFixture = order(org, nativeEvent, "PAID");
            var foreign = order(UUID.randomUUID(), null, "PAID");
            for (UUID member : List.of(financeOnly, eventsOnly)) {
                String events = body(web, as(get("/api/organizer/sales/events?q=ledger"), member, org));
                assertThat(events).contains(fixture.concert.toString(), nativeEvent.toString(),
                        nativeFixture.concert.toString(), "\"timezone\":\"Asia/Ho_Chi_Minh\"")
                        .doesNotContain(foreign.concert.toString());
            }
            assertThat(body(web, as(get("/api/organizer/sales/events?q=no-such-event"), financeOnly, org)))
                    .contains("\"content\":[]");
            assertThat(status(web, as(get("/api/organizer/sales/events"), neither, org))).isEqualTo(403);
        } finally {
            identity.stop(0);
        }
    }

    private static String body(MockMvc web, MockHttpServletRequestBuilder request) throws Exception {
        return web.perform(request).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private static int status(MockMvc web, MockHttpServletRequestBuilder request) throws Exception {
        return web.perform(request).andReturn().getResponse().getStatus();
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, UUID account, UUID organization) {
        return request.header("Authorization", "Bearer " + account).header("X-Organization-Id", organization.toString())
                .principal(new UsernamePasswordAuthenticationToken(account.toString(), null, List.of()));
    }

    /** Writes the SALE row (and a REFUND row when {@code refundedAt} is set) the way the live writer does. */
    private void record(Fixture fixture, OffsetDateTime paidAt, OffsetDateTime refundedAt) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            ledger.recordSale(fixture.order, "MOCK", paidAt);
            if (refundedAt != null) {
                ledger.recordRefund(fixture.order, "MOCK", refundedAt);
            }
        });
    }

    private int rows(UUID order, String kind) {
        return jdbc.queryForObject("SELECT count(*) FROM sales_ledger WHERE order_id=? AND kind=?", Integer.class, order, kind);
    }

    /** A concert (a native performance of {@code event} when given) with one two-ticket order. */
    private Fixture order(UUID organization, UUID event, String status) {
        UUID concert = UUID.randomUUID(), type = UUID.randomUUID(), order = UUID.randomUUID(), item = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,
                    sale_start_at,sale_end_at,status,created_by,organization_id)
                VALUES(?,?,?,?,now()+interval '3 days',now()+interval '3 days',
                    now()-interval '1 day',now()+interval '2 days','ON_SALE',?,?)
                """, concert, "Ledger proof", "Venue", "Address", UUID.randomUUID(), organization);
        jdbc.update("INSERT INTO ticket_types(id,concert_id,name,price,total_quantity,available_qty,max_per_account,zone_color,is_active)"
                + " VALUES(?,?,'General',100000,10,8,4,'#123456',true)", type, concert);
        jdbc.update("INSERT INTO ticket_inventory(ticket_type_id,total_quantity,available_qty,active) VALUES (?,10,8,true)", type);
        if (event != null) {
            jdbc.update("INSERT INTO performance_sales(id,event_id,source_version,ends_at,timezone,max_per_account,source_payload)"
                    + " VALUES(?,?,1,now()+interval '4 days','Asia/Ho_Chi_Minh',4,'{}'::jsonb)", concert, event);
            jdbc.update("DELETE FROM ticket_inventory WHERE ticket_type_id=?", type);
            jdbc.update("UPDATE ticket_types SET performance_offer=true WHERE id=?", type);
            UUID group = UUID.randomUUID();
            jdbc.update("INSERT INTO performance_groups(performance_id,id,section_label,kind,capacity,available,allocated)"
                    + " VALUES(?,?,'General','GA',10,8,2)", concert, group);
            jdbc.update("INSERT INTO orders(id,user_id,concert_id,status,total_amount,idempotency_key,paid_at,payment_provider,payment_ref,"
                    + "expires_at,performance_event_id,performance_title,performance_venue_name,performance_starts_at,performance_hold_version)"
                    + " VALUES(?,?,?,?,200000,?,?,?,?,now()+interval '1 hour',?,'Ledger proof','Venue',now(),1)",
                    order, buyer, concert, status, UUID.randomUUID().toString(), "PAID".equals(status) ? PAID : null,
                    "PAID".equals(status) ? "MOCK" : null, "PAID".equals(status) ? "pay-" + order : null, event);
            jdbc.update("INSERT INTO order_items(id,order_id,ticket_type_id,quantity,unit_price,subtotal,group_id,offer_name,section_label)"
                    + " VALUES(?,?,?,2,100000,200000,?,'General','General')", item, order, type, group);
        } else {
            jdbc.update("INSERT INTO orders(id,user_id,concert_id,status,total_amount,idempotency_key,paid_at,payment_provider,payment_ref,expires_at)"
                    + " VALUES(?,?,?,?,200000,?,?,?,?,now()+interval '1 hour')",
                    order, buyer, concert, status, UUID.randomUUID().toString(), "PAID".equals(status) ? PAID : null,
                    "PAID".equals(status) ? "MOCK" : null, "PAID".equals(status) ? "pay-" + order : null);
            jdbc.update("INSERT INTO order_items(id,order_id,ticket_type_id,quantity,unit_price,subtotal) VALUES(?,?,?,2,100000,200000)",
                    item, order, type);
        }
        jdbc.update("INSERT INTO order_events(order_id,stream_version,event_type,payload)"
                + " SELECT id,1,'OrderImported',order_projection_snapshot(id) FROM orders WHERE id=?", order);
        return new Fixture(concert, order);
    }

    private record Fixture(UUID concert, UUID order) {}

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
