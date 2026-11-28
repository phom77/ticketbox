package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;
import org.ticketbox.catalog.performance.application.WorkspaceOperations;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceReviewStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcWorkspaceOperationsStore;
import org.ticketbox.catalog.performance.web.PerformancePublicationReviewController;
import org.ticketbox.catalog.performance.web.WorkspaceOperationsController;
import org.ticketbox.catalog.web.GlobalExceptionHandler;
import org.ticketbox.catalog.web.security.OrganizationAccess;

@Testcontainers
class WorkspaceOperationsIntegrationTest {
    private static final String ADMIN = "/api/admin/v2";
    private static final String ORGANIZER = "/api/organizer/manage/v2";
    private static final String ACCESS = "http://identity/internal/split/v1/";
    private static final OffsetDateTime FROM = OffsetDateTime.parse("2030-05-10T00:00:00+07:00");
    private static final OffsetDateTime TO = FROM.plusDays(7);

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static JdbcTemplate jdbc;
    private final UUID actor = UUID.randomUUID();
    private final UUID owner = UUID.randomUUID();
    private final UUID other = UUID.randomUUID();
    private final UUID space = UUID.randomUUID();
    private MockRestServiceServer identity;
    private MockMvc mvc;

    @BeforeAll
    static void migrate() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        jdbc = new JdbcTemplate(source);
    }

    @BeforeEach
    void setup() {
        var json = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        var http = RestClient.builder();
        identity = MockRestServiceServer.bindTo(http).build();
        var operations = new WorkspaceOperations(new JdbcWorkspaceOperationsStore(jdbc));
        var performanceStore = new JdbcPerformanceStore(jdbc, json);
        var review = new PerformancePublicationReview(performanceStore, new JdbcPerformanceReviewStore(jdbc, json),
                new PerformanceCatalog(performanceStore,
                        new org.ticketbox.catalog.classification.application.ClassificationQuery(
                                new org.ticketbox.catalog.classification.infrastructure.JdbcClassificationStore(jdbc)), "*"));
        mvc = MockMvcBuilders.standaloneSetup(new WorkspaceOperationsController(operations),
                        new PerformancePublicationReviewController(review))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json))
                .addInterceptors(new OrganizationAccess(http.build(), "http://identity"))
                .build();

        UUID venue = UUID.randomUUID();
        jdbc.update("INSERT INTO venues(id,organization_id,name,address) VALUES (?,?,'Theater','District One')", venue, owner);
        jdbc.update("INSERT INTO venue_spaces(id,venue_id,name) VALUES (?,?,'Stage')", space, venue);
    }

    @Test
    void directoryPaginatesEventsBeforeJoiningPerformancesAndRetainsLegacyLinks() throws Exception {
        admin(5);
        UUID empty = event(owner, "Fixture no schedule", FROM);
        UUID event = event(owner, "Fixture two shows", FROM.minusDays(1));
        UUID draft = show(event, FROM.plusDays(1), "DRAFT", false, true);
        UUID otherDraft = show(event, FROM.plusDays(2), "DRAFT", false, true);
        UUID legacy = legacy();
        event(other, "Fixture from another organization", FROM.plusDays(1));

        var directory = ADMIN + "/events";
        mvc.perform(request(directory).param("query", "fixture").param("organizationId", owner.toString()).param("size", "2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content[0].id").value(empty.toString()))
                .andExpect(jsonPath("$.data.content[1].performanceCount").value(2));
        mvc.perform(request(directory).param("organizationId", owner.toString()).param("size", "2").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].legacyConcertId").value(legacy.toString()));
        mvc.perform(request(directory).param("organizationId", owner.toString()).param("size", "2").param("page", "2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content.length()").value(0));
        mvc.perform(request(directory).param("organizationId", owner.toString()).param("status", "PREPARING").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2));
        var detail = mvc.perform(request(directory + "/" + event)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(event.toString()))
                .andExpect(jsonPath("$.data.performances[0].id").value(draft.toString()))
                .andExpect(jsonPath("$.data.performances[1].id").value(otherDraft.toString()))
                .andReturn().getResponse();
        assertThat(detail.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
    }

    @Test
    void reportUsesHalfOpenBoundsAndCountsOnlyPublicOpenUnsuspendedSales() throws Exception {
        admin(5);
        UUID event = event(owner, "Boundary performances", FROM);
        UUID startsAtBound = show(event, FROM, "SOLD_OUT", false, true);
        show(event, TO, "ON_SALE", false, true);
        UUID active = show(event, FROM.plusDays(2), "ON_SALE", false, true);
        show(event, FROM.plusDays(3), "ON_SALE", true, true);
        show(event, FROM.plusDays(4), "ON_SALE", false, false);
        show(event, FROM.plusDays(5), "DRAFT", false, true);
        show(event, FROM.plusDays(6), "CANCELLED", false, true);
        var report = ADMIN + "/operations-report";
        mvc.perform(request(report).param("eventId", event.toString()).param("status", "UPCOMING")
                        .param("from", FROM.toString()).param("to", TO.toString()).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(4))
                .andExpect(jsonPath("$.data.content[0].id").value(startsAtBound.toString()));
        mvc.perform(request(report).param("eventId", event.toString()).param("status", "ON_SALE_NOW")
                        .param("asOf", FROM.toString()).param("to", TO.toString()).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(active.toString()))
                .andExpect(jsonPath("$.data.content[0].ticketingAcknowledged").value(true))
                .andExpect(jsonPath("$.data.content[0].checkinAcknowledged").value(false));
        mvc.perform(request(report).param("from", TO.toString()).param("to", FROM.toString()))
                .andExpect(status().isBadRequest());
        mvc.perform(request(report).param("from", FROM.toString()).param("to", FROM.plusYears(3).toString()))
                .andExpect(status().isBadRequest());
        UUID legacy = legacy();
        mvc.perform(request(report).param("concertId", legacy.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].legacyConcertId").value(legacy.toString()));
    }

    @Test
    void reviewFiltersUseCurrentRevisionForEachShowAndCountDistinctEventsNeedingChanges() throws Exception {
        admin(1);
        organization("EVENTS", 1);
        UUID event = event(owner, "Mixed decisions", FROM);
        UUID resubmitted = show(event, FROM.plusDays(1), "DRAFT", false, true);
        UUID changes = show(event, FROM.plusDays(2), "DRAFT", false, true);
        UUID moreChanges = show(event, FROM.plusDays(3), "DRAFT", false, true);
        UUID superseded = show(event, FROM.plusDays(4), "DRAFT", false, true);
        review(resubmitted, "CHANGES_REQUESTED", "Obsolete reason", FROM.minusDays(1));
        review(resubmitted, "SUBMITTED", null, FROM);
        review(changes, "CHANGES_REQUESTED", "Confirm venue", FROM);
        review(moreChanges, "CHANGES_REQUESTED", "Confirm time", FROM.minusDays(1));
        review(superseded, "SUBMITTED", null, FROM.minusDays(1));
        review(superseded, "SUPERSEDED", null, FROM);
        UUID legacy = legacy();
        UUID legacyReview = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concert_publication_reviews(id,concert_id,snapshot,publish_at,state,submitted_by,submitted_at)
                VALUES (?,?,'{}',?,'SUBMITTED',?,?)
                """, legacyReview, legacy, FROM, actor, FROM);
        mvc.perform(request(ADMIN + "/review-directory").param("organizationId", owner.toString()).param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].revision").value(legacyReview.toString()))
                .andExpect(jsonPath("$.data.content[0].model").value("LEGACY"));
        mvc.perform(organizer(ORGANIZER + "/event-directory").param("status", "CHANGES_REQUESTED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].changeReason").value("Confirm venue"))
                .andExpect(jsonPath("$.data.content[0].actionPerformanceId").value(changes.toString()));
        identity.verify();
    }

    @Test
    void adminCanReadTheCurrentSubmittedRevisionDirectly() throws Exception {
        admin(1);
        UUID event = event(owner, "Submitted performance", FROM);
        UUID performance = show(event, FROM.plusDays(1), "DRAFT", false, true);
        review(performance, "SUPERSEDED", null, FROM.minusDays(1));
        UUID current = review(performance, "SUBMITTED", null, FROM);

        mvc.perform(request(ADMIN + "/performance-reviews/" + performance))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(current.toString()))
                .andExpect(jsonPath("$.data.performanceId").value(performance.toString()));
        identity.verify();
    }

    @Test
    void adminReadsRejectMalformedFiltersAndPageParameters() throws Exception {
        admin(4);
        mvc.perform(request(ADMIN + "/operations-report").param("from", "2030-05-10"))
                .andExpect(status().isBadRequest());
        mvc.perform(request(ADMIN + "/events").param("page", "bogus"))
                .andExpect(status().isBadRequest());
        mvc.perform(request(ADMIN + "/events").param("size", "101"))
                .andExpect(status().isBadRequest());
        mvc.perform(request(ADMIN + "/events/invalid")).andExpect(status().isBadRequest());
        identity.verify();
    }

    @Test
    void organizerCannotUseAnotherOrganizationsIdentifiersOrInsufficientGrant() throws Exception {
        organization("FINANCE", 1);
        mvc.perform(organizer(ORGANIZER + "/event-directory")).andExpect(status().isForbidden());
        identity.verify();
        identity.reset();

        organization("EVENTS", 4);
        UUID foreignEvent = event(other, "Foreign event", FROM);
        UUID foreignShow = show(foreignEvent, TO, "ON_SALE", false, true);
        mvc.perform(organizer(ORGANIZER + "/event-directory").param("organizationId", other.toString()))
                .andExpect(status().isForbidden());
        mvc.perform(organizer(ORGANIZER + "/operations-report").param("eventId", foreignEvent.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(0));
        mvc.perform(organizer(ORGANIZER + "/operations-report").param("performanceId", foreignShow.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(0));
        mvc.perform(organizer(ORGANIZER + "/operations-report").param("organizationId", other.toString()))
                .andExpect(status().isForbidden());
        identity.verify();
    }

    @Test
    void platformReadsRequireCurrentPlatformAccess() throws Exception {
        identity.expect(requestTo(ACCESS + "platform-access")).andRespond(withStatus(HttpStatus.FORBIDDEN));
        mvc.perform(request(ADMIN + "/events")).andExpect(status().isForbidden());
        identity.verify();
    }

    private MockHttpServletRequestBuilder request(String path) {
        return get(path).principal(() -> actor.toString()).header(HttpHeaders.AUTHORIZATION, "Bearer fixture");
    }

    private MockHttpServletRequestBuilder organizer(String path) {
        return request(path).header("X-Organization-Id", owner);
    }

    private void admin(int calls) {
        identity.expect(ExpectedCount.times(calls), requestTo(ACCESS + "platform-access"))
                .andRespond(withStatus(HttpStatus.NO_CONTENT));
    }

    private void organization(String grant, int calls) {
        identity.expect(ExpectedCount.times(calls), requestTo(ACCESS + "organization-access/" + owner))
                .andRespond(withSuccess("""
                        {"accountId":"%s","organizationId":"%s","grants":["%s"]}
                        """.formatted(actor, owner, grant), MediaType.APPLICATION_JSON));
    }

    private UUID event(UUID organization, String title, OffsetDateTime created) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO events(id,organization_id,title,created_at) VALUES (?,?,?,?)",
                id, organization, title, created);
        return id;
    }

    private UUID legacy() {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,organization_id,title,venue_name,venue_address,event_date,sale_start_at,
                                     sale_end_at,status,created_by,created_at)
                VALUES (?,?,'Fixture legacy','Theater','District One',?,?,?,'ON_SALE',?,?)
                """, id, owner, FROM.plusDays(1), FROM.minusDays(2), FROM, actor, FROM.minusDays(2));
        return id;
    }

    private UUID show(UUID event, OffsetDateTime start, String state, boolean suspended, boolean visible) {
        UUID id = UUID.randomUUID();
        int version = "DRAFT".equals(state) ? 0 : 1;
        jdbc.update("""
                INSERT INTO performances(id,event_id,venue_space_id,starts_at,ends_at,timezone,
                                         sale_start_at,sale_end_at,status,sales_suspended,public_visible,sale_version)
                VALUES (?,?,?,?,?,'Asia/Ho_Chi_Minh',?,?,?,?,?,?)
                """, id, event, space, start, start.plusHours(2), FROM.minusDays(2), start.minusHours(1),
                state, suspended, visible, version);
        if (version > 0) {
            jdbc.update("""
                    INSERT INTO performance_sale_publications(performance_id,version,payload,actor_id,ticketing_ack)
                    VALUES (?,1,'{}',?,true)
                    """, id, actor);
        }
        return id;
    }

    private UUID review(UUID performance, String state, String reason, OffsetDateTime submitted) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO performance_publication_reviews(id,performance_id,submitted_by,submitted_at,publish_at,
                        sale_version,layout_version,event_draft_version,schedule_draft_version,summary,state,reason)
                VALUES (?,?,?,?,?,0,0,0,0,'{}',?,?)
                """, id, performance, actor, submitted, FROM.plusDays(1), state, reason);
        return id;
    }
}
