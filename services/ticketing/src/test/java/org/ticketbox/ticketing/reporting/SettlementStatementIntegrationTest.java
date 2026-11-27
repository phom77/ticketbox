package org.ticketbox.ticketing.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.sun.net.httpserver.HttpServer;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
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
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.reporting.application.SalesReportService;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService;
import org.ticketbox.ticketing.reporting.application.SettlementStatementService.StatementConflict;
import org.ticketbox.ticketing.reporting.application.port.OrganizationProfiles;
import org.ticketbox.ticketing.reporting.application.port.OrganizationProfiles.Profile;
import org.ticketbox.ticketing.reporting.application.port.SalesLedger;
import org.ticketbox.ticketing.reporting.application.port.StatementLogoFetcher;
import org.ticketbox.ticketing.reporting.domain.SettlementStatement;
import org.ticketbox.ticketing.reporting.web.StatementController;
import org.ticketbox.ticketing.web.GlobalExceptionHandler;
import org.ticketbox.ticketing.web.security.OrganizationAccess;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;

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
class SettlementStatementIntegrationTest {
    @Autowired private SettlementStatementService statements;
    @Autowired private SalesReportService reports;
    @Autowired private SalesLedger ledger;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private org.springframework.context.ApplicationContext context;
    @Autowired @Qualifier("serviceClient") private RestClient serviceClient;
    @MockBean private OrganizationProfiles profiles;
    @MockBean private StatementLogoFetcher logos;
    @MockBean private RefundProviders providers;
    @MockBean private PaymentRemoteClient payment;
    @MockBean private UserContactPort identity;

    private static final OffsetDateTime PAID = OffsetDateTime.parse("2026-12-01T03:00:00Z");
    private static final OffsetDateTime REFUNDED = OffsetDateTime.parse("2026-12-05T03:00:00Z");
    private final UUID buyer = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();
    private String legalName;

    @BeforeEach
    void profile() {
        legalName = "Công ty TNHH Ánh Dương";
        when(profiles.fetch(any())).thenAnswer(call -> profile(call.getArgument(0), legalName, null, null));
        when(logos.fetch(anyString())).thenReturn(Optional.empty());
    }

    private static Profile profile(UUID org, String legal, String logo, String png) {
        return new Profile(org, "Ánh Dương Live", legal, "0312345678", "1 Đường Lê Lợi, Quận 1", "desk@example.test",
                "+84 28 1234 5678", "https://example.test", logo, png, "Asia/Ho_Chi_Minh", 3);
    }

    @Test
    void anEventStatementMatchesTheSalesReportAndShowsRefundsProvidersAndUnreconciledOrders() {
        var org = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        var first = order(org, event, "PAID");
        var second = order(org, event, "PAID");
        record(first, PAID, null);
        record(second, PAID.plusDays(1), REFUNDED);
        reconcile(first, "MOCK", 200000);
        finish(first, second);

        var issued = statements.issue(org, actor, "EVENT", event, 0);
        var s = issued.statement();
        assertThat(issued.logoOmitted()).isFalse();
        assertThat(s.number()).matches("TBS-\\d{4}-\\d{6}");
        assertThat(s.revision()).isEqualTo(1);
        assertThat(s.totals().grossSales()).isEqualTo(400000);
        assertThat(s.totals().refunds()).isEqualTo(200000);
        assertThat(s.totals().netSales()).isEqualTo(200000);
        assertThat(s.totals().saleOrders()).isEqualTo(2);
        assertThat(s.totals().refundOrders()).isEqualTo(1);
        assertThat(s.totals().ticketsSold()).isEqualTo(4);
        assertThat(s.totals().ticketsRefunded()).isEqualTo(2);
        assertThat(s.totals().unreconciledOrders()).isEqualTo(1);
        assertThat(s.totals().verifiedCollected()).isEqualTo(200000);

        var all = reports.summary(org, event, null, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 12, 31), true);
        assertThat(all.grossSales()).isEqualTo(s.totals().grossSales());
        assertThat(all.refunds()).isEqualTo(s.totals().refunds());
        assertThat(all.netSales()).isEqualTo(s.totals().netSales());
        assertThat(all.ticketsSold()).isEqualTo(s.totals().ticketsSold());

        var detail = statements.detail(org, s.id());
        var performanceLines = detail.lines().stream().filter(l -> l.kind().equals("PERFORMANCE")).toList();
        assertThat(performanceLines).hasSize(2);
        assertThat(performanceLines.stream().mapToLong(l -> l.netSales()).sum()).isEqualTo(200000);
        assertThat(detail.lines().stream().filter(l -> l.kind().equals("OFFER"))).hasSize(2);
        var provider = detail.lines().stream().filter(l -> l.kind().equals("PROVIDER")).toList();
        assertThat(provider).hasSize(1);
        assertThat(provider.get(0).provider()).isEqualTo("MOCK");
        assertThat(provider.get(0).grossSales()).isEqualTo(400000);
        assertThat(provider.get(0).verifiedCollected()).isEqualTo(200000);
        assertThat(detail.organization().legalName()).isEqualTo(legalName);
        assertThat(detail.outOfDate()).isFalse();
    }

    @Test
    void aScopeThatIsNotFinalIsRefusedAndAnotherOrganizationsIdsAreNotFound() {
        var org = UUID.randomUUID();
        var open = order(org, UUID.randomUUID(), "PAID");
        assertThatThrownBy(() -> statements.issue(org, actor, "PERFORMANCE", open.concert, 0))
                .isInstanceOfSatisfying(AppException.class, e -> {
                    assertThat(e.getErrorCode()).isEqualTo(ErrorCode.STATEMENT_NOT_FINAL);
                    assertThat(e.getMessage()).isEqualTo("error.statement.not-ended");
                });
        UUID event = UUID.randomUUID();
        var done = order(org, event, "PAID");
        var pending = order(org, event, "PAID");
        finish(done);
        assertThatThrownBy(() -> statements.issue(org, actor, "EVENT", event, 0)).isInstanceOf(AppException.class);
        finish(pending);
        UUID stranger = UUID.randomUUID();
        assertThatThrownBy(() -> statements.issue(stranger, actor, "PERFORMANCE", done.concert, 0))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        var issued = statements.issue(org, actor, "EVENT", event, 0).statement();
        assertThatThrownBy(() -> statements.detail(stranger, issued.id())).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> statements.download(stranger, issued.id(), "pdf")).isInstanceOf(AppException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM settlement_statements WHERE organization_id=?", Integer.class,
                stranger)).isZero();
    }

    @Test
    void aRefundAfterIssueMakesTheStatementOutOfDateAndARevisionSupersedesItWithoutChangingTheOld() {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        record(fixture, PAID, null);
        finish(fixture);
        var first = statements.issue(org, actor, "PERFORMANCE", fixture.concert, 0).statement();
        byte[] firstPdf = statements.download(org, first.id(), "pdf").content();
        assertThat(statements.detail(org, first.id()).outOfDate()).isFalse();
        assertThatThrownBy(() -> statements.issue(org, actor, "PERFORMANCE", fixture.concert, 1))
                .isInstanceOf(StatementConflict.class);

        legalName = "Tên pháp lý mới";
        record(fixture, null, REFUNDED);
        var stale = statements.detail(org, first.id());
        assertThat(stale.outOfDate()).isTrue();
        assertThat(stale.totals().refunds()).isZero();
        assertThat(statements.eligible(org, null, 0, 20).content()).anySatisfy(row -> {
            assertThat(row.scopeId()).isEqualTo(fixture.concert);
            assertThat(row.outOfDate()).isTrue();
            assertThat(row.statementNumber()).isEqualTo(first.number());
        });

        var second = statements.issue(org, actor, "PERFORMANCE", fixture.concert, 1).statement();
        assertThat(second.revision()).isEqualTo(2);
        assertThat(second.number()).isEqualTo(first.number() + "-R2");
        assertThat(second.totals().refunds()).isEqualTo(200000);
        assertThat(second.supersedesId()).isEqualTo(first.id());
        var old = statements.detail(org, first.id());
        assertThat(old.status()).isEqualTo("SUPERSEDED");
        assertThat(old.supersededByNumber()).isEqualTo(second.number());
        assertThat(old.outOfDate()).isFalse();
        assertThat(old.totals().refunds()).isZero();
        assertThat(old.organization().legalName()).isEqualTo("Công ty TNHH Ánh Dương");
        assertThat(statements.detail(org, second.id()).organization().legalName()).isEqualTo("Tên pháp lý mới");
        assertThat(statements.download(org, first.id(), "pdf").content()).isEqualTo(firstPdf);
        assertThat(statements.list(org, null, 0, 20).content()).extracting(SettlementStatement::revision)
                .containsExactly(2, 1);
        assertThat(statements.eligible(org, null, 0, 20).content()).noneMatch(row -> row.scopeId().equals(fixture.concert));
    }

    @Test
    void concurrentAndRepeatedIssueCreateExactlyOneRevision() throws Exception {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        record(fixture, PAID, null);
        finish(fixture);
        var pool = Executors.newFixedThreadPool(4);
        try {
            var calls = new ArrayList<java.util.concurrent.Future<Object>>();
            for (int i = 0; i < 4; i++) {
                calls.add(pool.submit(() -> {
                    try {
                        return statements.issue(org, actor, "PERFORMANCE", fixture.concert, 0);
                    } catch (StatementConflict conflict) {
                        return conflict;
                    }
                }));
            }
            int issued = 0;
            int conflicts = 0;
            for (var call : calls) {
                Object result = call.get();
                if (result instanceof StatementConflict conflict) {
                    conflicts++;
                    assertThat(conflict.current().revision()).isEqualTo(1);
                } else {
                    issued++;
                }
            }
            assertThat(issued).isEqualTo(1);
            assertThat(conflicts).isEqualTo(3);
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM settlement_statements WHERE scope_id=?", Integer.class,
                fixture.concert)).isEqualTo(1);
    }

    @Test
    void whenIdentityIsUnavailableNothingIsWrittenAndIssuedStatementsStayReadable() {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        record(fixture, PAID, null);
        finish(fixture);
        var issued = statements.issue(org, actor, "PERFORMANCE", fixture.concert, 0).statement();
        record(fixture, null, REFUNDED);
        when(profiles.fetch(any())).thenThrow(
                new AppException(ErrorCode.STATEMENT_PROFILE_UNAVAILABLE, "error.statement.profile-unavailable"));
        assertThatThrownBy(() -> statements.issue(org, actor, "PERFORMANCE", fixture.concert, 1))
                .isInstanceOfSatisfying(AppException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.STATEMENT_PROFILE_UNAVAILABLE));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM settlement_statements WHERE scope_id=?", Integer.class,
                fixture.concert)).isEqualTo(1);
        assertThat(statements.detail(org, issued.id()).number()).isEqualTo(issued.number());
        assertThat(statements.download(org, issued.id(), "csv").content()).isNotEmpty();
    }

    @Test
    void aStatementWithoutSalesHasZeroFiguresAndNoProviderLines() {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "EXPIRED");
        finish(fixture);
        var s = statements.issue(org, actor, "PERFORMANCE", fixture.concert, 0).statement();
        assertThat(s.totals().netSales()).isZero();
        assertThat(s.totals().saleOrders()).isZero();
        assertThat(statements.detail(org, s.id()).lines()).noneMatch(l -> l.kind().equals("PROVIDER"));
    }

    @Test
    void aLogoThatCannotBeFetchedIsOmittedAndSaidSo() {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        finish(fixture);
        when(profiles.fetch(any())).thenReturn(profile(org, legalName,
                "https://res.cloudinary.com/demo/image/upload/a.webp",
                "https://res.cloudinary.com/demo/image/upload/f_png,w_400,c_limit/a.webp"));
        var issued = statements.issue(org, actor, "PERFORMANCE", fixture.concert, 0);
        assertThat(issued.logoOmitted()).isTrue();
        assertThat(issued.statement().organization().logoIncluded()).isFalse();
    }

    @Test
    void downloadsCarryTheSameFiguresInBothFormatsAndRenderVietnameseText() throws Exception {
        var org = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        record(fixture, PAID, REFUNDED);
        finish(fixture);
        var s = statements.issue(org, actor, "PERFORMANCE", fixture.concert, 0).statement();
        var pdf = statements.download(org, s.id(), "pdf");
        assertThat(pdf.filename()).isEqualTo(s.number() + ".pdf");
        byte[] again = statements.download(org, s.id(), "PDF").content();
        assertThat(again).isEqualTo(pdf.content());
        String text;
        try (var document = Loader.loadPDF(pdf.content())) {
            text = new PDFTextStripper().getText(document);
        }
        assertThat(text).contains(s.number(), "Platform fee: 0 VND", "Công ty TNHH Ánh Dương", "Net sales (VND)",
                "not an invoice,");
        var csv = statements.download(org, s.id(), "csv");
        assertThat(csv.filename()).isEqualTo(s.number() + ".csv");
        String csvText = new String(csv.content(), StandardCharsets.UTF_8);
        assertThat(csvText.charAt(0)).isEqualTo((char) 0xFEFF);
        assertThat(csvText).contains(s.number(), "Platform fee", "0 VND", "Công ty TNHH Ánh Dương",
                "\"Gross sales (VND)\",\"200000\"", "\"Refunds (VND)\",\"200000\"", "\"Net sales (VND)\",\"0\"");
        assertThatThrownBy(() -> statements.download(org, s.id(), "xlsx"))
                .isInstanceOfSatisfying(AppException.class, e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_REQUEST));
    }

    @Test
    void salesReportsUseTheOrganizationZoneForOrganizationScopeAndThePerformanceZoneForOnePerformance() {
        var org = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        var fixture = order(org, event, "PAID");
        record(fixture, PAID, null);
        LocalDate day = LocalDate.of(2026, 12, 1);
        ZoneId losAngeles = ZoneId.of("America/Los_Angeles");
        var inHcm = reports.summary(org, null, null, day, day, true);
        assertThat(inHcm.ticketsSold()).isEqualTo(2);
        assertThat(inHcm.timezone()).isEqualTo("Asia/Ho_Chi_Minh");
        var inLa = reports.summary(org, losAngeles, null, null, day, day, true);
        assertThat(inLa.ticketsSold()).isZero();
        assertThat(inLa.timezone()).isEqualTo("America/Los_Angeles");
        assertThat(reports.summary(org, losAngeles, null, null, day.minusDays(1), day.minusDays(1), true).ticketsSold())
                .isEqualTo(2);
        assertThat(reports.trend(org, losAngeles, event, null, day, day, "hour", true).timezone())
                .isEqualTo("America/Los_Angeles");
        var one = reports.summary(org, losAngeles, null, fixture.concert, day, day, true);
        assertThat(one.timezone()).isEqualTo("Asia/Ho_Chi_Minh");
        assertThat(one.ticketsSold()).isEqualTo(2);
        var legacy = order(org, null, "PAID");
        record(legacy, PAID, null);
        assertThat(reports.summary(org, losAngeles, null, legacy.concert, day, day, true).timezone())
                .isEqualTo("America/Los_Angeles");
    }

    @Test
    void theStatementEndpointsNeedFinanceAndKeepOrganizationsApart() throws Exception {
        var org = UUID.randomUUID();
        var other = UUID.randomUUID();
        var fixture = order(org, null, "PAID");
        record(fixture, PAID, null);
        finish(fixture);
        UUID financeOnly = UUID.randomUUID(), eventsOnly = UUID.randomUUID();
        Map<UUID, String> grants = Map.of(financeOnly, "[\"FINANCE\"]", eventsOnly, "[\"EVENTS\"]");
        HttpServer identity = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        identity.createContext("/internal/split/v1/organization-access/", exchange -> {
            UUID account = UUID.fromString(exchange.getRequestHeaders().getFirst("Authorization").substring(7));
            String organization = exchange.getRequestURI().getPath().substring(exchange.getRequestURI().getPath().lastIndexOf('/') + 1);
            byte[] body = ("{\"accountId\":\"" + account + "\",\"organizationId\":\"" + organization + "\",\"grants\":"
                    + grants.get(account) + ",\"reportingTimezone\":\"Asia/Bangkok\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        identity.start();
        try {
            MockMvc web = MockMvcBuilders.standaloneSetup(context.getBean(StatementController.class))
                    .addInterceptors(new OrganizationAccess(serviceClient, "http://127.0.0.1:" + identity.getAddress().getPort()))
                    .setControllerAdvice(new GlobalExceptionHandler()).build();
            assertThat(status(web, as(get("/api/organizer/statements/eligible"), eventsOnly, org))).isEqualTo(403);
            assertThat(status(web, as(post("/api/organizer/statements"), eventsOnly, org).contentType(MediaType.APPLICATION_JSON)
                    .content("{}"))).isEqualTo(403);
            var eligible = web.perform(as(get("/api/organizer/statements/eligible"), financeOnly, org)).andReturn().getResponse();
            assertThat(eligible.getStatus()).isEqualTo(200);
            assertThat(eligible.getHeader("Cache-Control")).contains("no-store");
            assertThat(eligible.getContentAsString()).contains(fixture.concert.toString());
            String issue = "{\"scopeType\":\"PERFORMANCE\",\"scopeId\":\"" + fixture.concert + "\",\"expectedRevision\":0}";
            var created = web.perform(as(post("/api/organizer/statements"), financeOnly, org)
                    .contentType(MediaType.APPLICATION_JSON).content(issue)).andReturn().getResponse();
            assertThat(created.getStatus()).isEqualTo(201);
            String body = created.getContentAsString(StandardCharsets.UTF_8);
            assertThat(body).contains("\"revision\":1", "\"logoOmitted\":false");
            String id = body.replaceAll("(?s).*?\"statement\":\\{\"id\":\"([0-9a-f-]{36})\".*", "$1");
            var conflict = web.perform(as(post("/api/organizer/statements"), financeOnly, org)
                    .contentType(MediaType.APPLICATION_JSON).content(issue)).andReturn().getResponse();
            assertThat(conflict.getStatus()).isEqualTo(409);
            assertThat(conflict.getContentAsString()).contains("\"revision\":1");
            assertThat(status(web, as(get("/api/organizer/statements/" + id), financeOnly, org))).isEqualTo(200);
            assertThat(status(web, as(get("/api/organizer/statements/" + id), financeOnly, other))).isEqualTo(404);
            assertThat(status(web, as(get("/api/organizer/statements/" + id + "/download?format=docx"), financeOnly, org)))
                    .isEqualTo(400);
            var pdf = web.perform(as(get("/api/organizer/statements/" + id + "/download?format=pdf"), financeOnly, org))
                    .andReturn().getResponse();
            assertThat(pdf.getStatus()).isEqualTo(200);
            assertThat(pdf.getContentAsByteArray()).startsWith("%PDF".getBytes(StandardCharsets.US_ASCII));
            assertThat(pdf.getHeader("Content-Disposition")).contains("TBS-");
            assertThat(status(web, as(get("/api/organizer/statements"), eventsOnly, org))).isEqualTo(403);
        } finally {
            identity.stop(0);
        }
    }

    private static int status(MockMvc web, MockHttpServletRequestBuilder request) throws Exception {
        return web.perform(request).andReturn().getResponse().getStatus();
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, UUID account, UUID organization) {
        return request.header("Authorization", "Bearer " + account).header("X-Organization-Id", organization.toString())
                .principal(new UsernamePasswordAuthenticationToken(account.toString(), null, List.of()));
    }

    /** Writes the SALE row (when paidAt is given) and a REFUND row (when refundedAt is given) like the live writer. */
    private void record(Fixture fixture, OffsetDateTime paidAt, OffsetDateTime refundedAt) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            if (paidAt != null) ledger.recordSale(fixture.order, "MOCK", paidAt);
            if (refundedAt != null) ledger.recordRefund(fixture.order, "MOCK", refundedAt);
        });
    }

    private void reconcile(Fixture fixture, String provider, long collected) {
        jdbc.update("""
                INSERT INTO payment_reconciliation(intent_id, order_id, revision, provider, state, requested_amount,
                    transaction_id, collected_amount, attempted_at, verified_at, changed_at)
                VALUES (?, ?, 1, ?, 'PAID', ?, 'tx-1', ?, now(), now(), now())
                """, UUID.randomUUID(), fixture.order, provider, collected, collected);
    }

    private void finish(Fixture... fixtures) {
        for (var fixture : fixtures) {
            jdbc.update("UPDATE concerts SET status = 'COMPLETED' WHERE id = ?", fixture.concert);
        }
    }

    private Fixture order(UUID organization, UUID event, String status) {
        UUID concert = UUID.randomUUID(), type = UUID.randomUUID(), order = UUID.randomUUID(), item = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,title,venue_name,venue_address,event_date,doors_open_at,
                    sale_start_at,sale_end_at,status,created_by,organization_id)
                VALUES(?,?,?,?,now()+interval '3 days',now()+interval '3 days',
                    now()-interval '1 day',now()+interval '2 days','ON_SALE',?,?)
                """, concert, "Statement proof " + concert.toString().substring(0, 4), "Venue", "Address",
                UUID.randomUUID(), organization);
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
                    + " VALUES(?,?,?,?,200000,?,?,?,?,now()+interval '1 hour',?,'Statement proof','Venue',now(),1)",
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
