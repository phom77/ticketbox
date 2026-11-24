package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.springframework.http.HttpMethod.PUT;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview.Action;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceReviewStore;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Point;
import org.ticketbox.catalog.performance.domain.PerformanceSale;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceStore;
import org.ticketbox.catalog.performance.infrastructure.PerformancePublisher;
import org.ticketbox.catalog.performance.web.OrganizerPerformanceController;
import org.ticketbox.catalog.performance.web.PerformanceOperationsController;
import org.ticketbox.catalog.performance.web.PublicPerformanceController;
import org.ticketbox.catalog.web.GlobalExceptionHandler;
import org.ticketbox.catalog.web.security.OrganizationAccess;

@Testcontainers
class PerformanceCatalogIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final String TICKETING = "http://ticketing/internal/ticketing/catalog/performances/";
    private static final String CHECKIN = "http://checkin/internal/checkin/catalog/performances/";
    private static final String ORGANIZER = "/api/organizer/manage/v2";

    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static ObjectMapper json;
    private static PerformanceCatalog catalog;
    private static PerformancePublicationReview reviews;
    private static MockMvc organizer;
    private static MockMvc publicCatalog;
    private UUID owner;
    private UUID event;
    private UUID venue;
    private UUID space;

    @BeforeAll
    static void migrate() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        jdbc = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        json = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        var store = new JdbcPerformanceStore(jdbc, json);
        catalog = new PerformanceCatalog(store, "*");
        reviews = new PerformancePublicationReview(store, new JdbcPerformanceReviewStore(jdbc, json), catalog);
        organizer = MockMvcBuilders.standaloneSetup(new OrganizerPerformanceController(catalog, reviews), new PerformanceOperationsController(catalog))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json))
                .build();
        publicCatalog = MockMvcBuilders.standaloneSetup(new PublicPerformanceController(catalog))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json))
                .build();
    }

    @Test
    void discoveryFindsLegacyTranslationAndNativeEventBeforePagingAndCountsEachEventOnce() throws Exception {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(50).withNano(0);
        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts (id,title,venue_name,venue_address,event_date,sale_start_at,status,poster_url,created_by,localized_content)
                VALUES (?,'Evening showcase','Grand Hall','Main Street',?,?,'ON_SALE','https://example.test/poster.jpg',?,?)
                """, legacy, starts, starts.minusDays(1), owner,
                "{\"original\":{\"title\":\"Evening showcase\"},\"translations\":{\"vi\":{\"title\":\"Đêm nhạc Duy Anh\"}}}");
        var nativeEvent = tx(() -> catalog.createEvent(owner, "Đêm nhạc Duy Anh", "Tour", "music")).id();
        var first = discoveryShow(nativeEvent, starts.plusDays(1), starts.minusDays(4), true);
        discoveryShow(nativeEvent, starts.plusDays(2), starts.minusDays(3), true);
        discoveryShow(nativeEvent, starts.minusDays(1), starts.minusDays(5), false);

        var path = MockMvcRequestBuilders.get("/api/v2/events/discovery")
                .param("q", "dem NHAC duy anh").param("size", "1");
        var firstPage = discoveryPage(path);
        assertThat(firstPage.path("totalElements").asInt()).isEqualTo(2);
        var firstCard = firstPage.path("content").get(0);
        assertThat(firstCard.path("id").asText()).isEqualTo(legacy.toString());
        assertThat(firstCard.path("eventId").isNull()).isTrue();
        assertThat(firstCard.path("posterUrl").asText()).isEqualTo("https://example.test/poster.jpg");
        assertThat(firstCard.path("translations").path("vi").path("title").asText()).isEqualTo("Đêm nhạc Duy Anh");

        var secondPage = discoveryPage(path.param("page", "1"));
        var secondCard = secondPage.path("content").get(0);
        assertThat(secondCard.path("id").asText()).isEqualTo(first.toString());
        assertThat(secondCard.path("eventId").asText()).isEqualTo(nativeEvent.toString());
        assertThat(secondPage.path("last").asBoolean()).isTrue();

        var sorted = discoveryPage(MockMvcRequestBuilders.get("/api/v2/events/discovery")
                .param("q", "đêm nhạc duy anh").param("sort", "sale-start"));
        assertThat(sorted.path("content").get(0).path("id").asText()).isEqualTo(first.toString());

        var beyondLast = discoveryPage(MockMvcRequestBuilders.get("/api/v2/events/discovery")
                .param("q", "dem nhac duy anh").param("size", "1").param("page", "3"));
        assertThat(beyondLast.path("content").isEmpty()).isTrue();
        assertThat(beyondLast.path("totalElements").asInt()).isEqualTo(2);
    }

    @Test
    void discoveryAppliesSaleStatusAndVietnamDateToTheSamePublicPerformance() throws Exception {
        var now = OffsetDateTime.now(ZoneOffset.UTC).withNano(0);
        var localStart = now.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate()
                .plusDays(2).atStartOfDay(ZoneId.of("Asia/Ho_Chi_Minh")).toOffsetDateTime();
        var nativeEvent = tx(() -> catalog.createEvent(owner, "Chương trình lọc suất", "Tour", "music")).id();
        var futureSale = discoveryShow(nativeEvent, localStart, now.plusMinutes(30), true);
        var onSale = discoveryShow(nativeEvent, localStart.plusDays(1), now.minusDays(1), true);
        discoveryShow(nativeEvent, localStart.plusMinutes(5), now.minusDays(1), false);

        var path = "/api/v2/events/discovery";
        var date = localStart.toLocalDate().toString();
        var noSameShow = discoveryPage(MockMvcRequestBuilders.get(path).param("q", "loc suat")
                .param("date", "custom").param("to", date).param("status", "on-sale"));
        assertThat(noSameShow.path("totalElements").asInt()).isZero();
        var matches = discoveryPage(MockMvcRequestBuilders.get(path).param("q", "loc suat")
                .param("date", "custom").param("from", date).param("to", date).param("status", "upcoming"));
        assertThat(matches.path("content").get(0).path("id").asText()).isEqualTo(futureSale.toString());

        jdbc.update("UPDATE performances SET sales_suspended=true WHERE id=?", onSale);
        var suspended = discoveryPage(MockMvcRequestBuilders.get(path).param("q", "loc suat")
                .param("date", "custom").param("from", date).param("status", "closed"));
        var card = suspended.path("content").get(0);
        assertThat(card.path("id").asText()).isEqualTo(onSale.toString());
        assertThat(card.path("salesSuspended").asBoolean()).isTrue();
        assertThat(card.path("status").asText()).isEqualTo("ON_SALE");
    }

    @Test
    void discoveryRejectsUnsupportedSearchParameters() throws Exception {
        String path = "/api/v2/events/discovery";
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("q", "x".repeat(161))).andExpect(status().isBadRequest());
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("status", "DRAFT")).andExpect(status().isBadRequest());
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("sort", "arbitrary")).andExpect(status().isBadRequest());
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("date", "someday")).andExpect(status().isBadRequest());
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("date", "custom").param("from", "2026-02-30"))
                .andExpect(status().isBadRequest());
    }

    private UUID discoveryShow(UUID eventId, OffsetDateTime starts, OffsetDateTime saleStarts, boolean acknowledged) {
        var schedule = new PerformanceCatalog.Schedule(space, starts, starts.plusHours(2), null,
                "Asia/Ho_Chi_Minh", saleStarts, starts.minusHours(1), 4, true);
        var performance = tx(() -> catalog.createPerformance(owner, eventId, schedule));
        tx(() -> catalog.saveSale(owner, owner, performance.id(), 0, maplessSale(performance.saleStartAt(), performance.saleEndAt())));
        tx(() -> catalog.publish(owner, owner, performance.id(), 1L, 0L, null, null));
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=? WHERE performance_id=?",
                acknowledged, performance.id());
        return performance.id();
    }

    private com.fasterxml.jackson.databind.JsonNode discoveryPage(MockHttpServletRequestBuilder request) throws Exception {
        var result = publicCatalog.perform(request).andExpect(status().isOk()).andReturn().getResponse();
        return json.readTree(result.getContentAsByteArray()).path("data");
    }

    @Test
    void operationsDirectoryFindsPublishedShowsByVenueAndKeepsDraftsPrivate() throws Exception {
        var hall = tx(() -> catalog.createVenue(owner, "Grand Theater", "District One", "Auditorium"));
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(3).withNano(0);
        var first = tx(() -> catalog.createPerformance(owner, event, new PerformanceCatalog.Schedule(
                hall.spaces().getFirst().id(), starts, starts.plusHours(2), null, "Asia/Ho_Chi_Minh",
                starts.minusDays(2), starts.minusHours(1), 4, false)));
        var draft = tx(() -> catalog.createPerformance(owner, event, new PerformanceCatalog.Schedule(
                hall.spaces().getFirst().id(), starts.plusDays(1), starts.plusDays(1).plusHours(2),
                null, "Asia/Ho_Chi_Minh", starts.minusDays(1), starts, 4, true)));
        tx(() -> catalog.saveSale(owner, owner, first.id(), 0, maplessSale(first.saleStartAt(), first.saleEndAt())));
        tx(() -> catalog.publish(owner, owner, first.id(), 1L, 0L, null, null));

        String path = "/api/admin/v2/performances";
        var search = organizer.perform(MockMvcRequestBuilders.get(path).param("query", "grand theater").param("size", "1"))
                .andExpect(status().isOk()).andReturn().getResponse();
        var page = json.readTree(search.getContentAsByteArray()).path("data");
        assertThat(search.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(page.path("totalElements").asInt()).isEqualTo(1);
        assertThat(page.path("content").get(0).path("id").asText()).isEqualTo(first.id().toString());
        assertThat(page.path("content").get(0).path("title").asText()).isEqualTo("Two nights");

        var detail = organizer.perform(MockMvcRequestBuilders.get(path + "/" + first.id()))
                .andExpect(status().isOk()).andReturn().getResponse();
        var show = json.readTree(detail.getContentAsByteArray()).path("data");
        assertThat(show.path("spaceName").asText()).isEqualTo("Auditorium");
        assertThat(show.path("timezone").asText()).isEqualTo("Asia/Ho_Chi_Minh");
        assertThat(show.path("ticketingAcknowledged").asBoolean()).isFalse();
        organizer.perform(MockMvcRequestBuilders.get(path + "/" + draft.id())).andExpect(status().isNotFound());
        organizer.perform(MockMvcRequestBuilders.get(path).param("size", "101")).andExpect(status().isBadRequest());
    }

    @Test
    void revisesEventDraftInPlaceAndRejectsStaleEditors() {
        var draft = newPerformance(3);
        var update = json.createObjectNode().put("title", "Third night").put("category", "music")
                .put("expectedDraftVersion", 0);
        var path = ORGANIZER + "/events/" + event;
        organizerRequest(MockMvcRequestBuilders.put(path), UUID.randomUUID(), update, 404);
        var revised = organizerRequest(MockMvcRequestBuilders.put(path), owner, update, 200);
        assertThat(revised.path("id").asText()).isEqualTo(event.toString());
        assertThat(revised.path("draftVersion").asLong()).isEqualTo(1);
        assertThat(revised.path("performances").get(0).path("id").asText()).isEqualTo(draft.id().toString());
        organizerRequest(MockMvcRequestBuilders.put(path), owner, update.put("title", "Stale"), 409);
        assertThat(catalog.event(event, owner).title()).isEqualTo("Third night");
    }

    @Test
    void changesDraftScheduleInPlaceAndPreservesExistingOffers() {
        var draft = newPerformance(3);
        var sale = maplessSale(draft.saleStartAt(), draft.saleEndAt());
        tx(() -> catalog.saveSale(owner, owner, draft.id(), 0, sale));
        var venue = tx(() -> catalog.createVenue(owner, "Other room", "Address", "Stage"));
        var moved = draft.startsAt().plusDays(1);
        var update = json.<ObjectNode>valueToTree(new PerformanceCatalog.Schedule(venue.spaces().getFirst().id(),
                moved, moved.plusHours(2), moved.minusHours(1), "Asia/Ho_Chi_Minh",
                draft.saleStartAt(), draft.saleEndAt(), 6, false));
        update.put("expectedDraftVersion", 0);
        var path = ORGANIZER + "/performances/" + draft.id() + "/schedule";
        organizerRequest(MockMvcRequestBuilders.put(path), UUID.randomUUID(), update, 404);
        var invalid = update.deepCopy().put("endsAt", moved.minusHours(1).toString());
        organizerRequest(MockMvcRequestBuilders.put(path), owner, invalid, 400);
        var revised = organizerRequest(MockMvcRequestBuilders.put(path), owner, update, 200);
        assertThat(revised.path("id").asText()).isEqualTo(draft.id().toString());
        assertThat(revised.path("draftVersion").asLong()).isEqualTo(1);
        assertThat(revised.path("venueName").asText()).isEqualTo("Other room");
        assertThat(revised.path("maxPerAccount").asInt()).isEqualTo(6);
        assertThat(revised.path("publicVisible").asBoolean()).isFalse();
        organizerRequest(MockMvcRequestBuilders.put(path), owner, update, 409);
        assertThat(catalog.event(event, owner).performances()).singleElement()
                .satisfies(saved -> assertThat(saved.startsAt()).isEqualTo(moved));
        assertThat(tx(() -> catalog.sale(owner, draft.id())).offers()).containsExactlyElementsOf(sale.offers());
    }

    @Test
    void waitingScheduleEditUsesTheVersionCommittedByTheFirstEditor() throws Exception {
        var draft = newPerformance(3);
        var path = ORGANIZER + "/performances/" + draft.id() + "/schedule";
        var update = json.<ObjectNode>valueToTree(new PerformanceCatalog.Schedule(space, draft.startsAt(),
                draft.endsAt(), draft.doorsOpenAt(), draft.timezone(), draft.saleStartAt(), draft.saleEndAt(), 6, true));
        update.put("expectedDraftVersion", 0);

        try (var worker = Executors.newSingleThreadExecutor()) {
            var backendPid = new CompletableFuture<Integer>();
            var waiting = tx(() -> {
                jdbc.queryForObject("SELECT id FROM performances WHERE id=? FOR UPDATE", UUID.class, draft.id());
                var request = worker.submit(() -> tx(() -> {
                    backendPid.complete(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
                    return organizerRequest(MockMvcRequestBuilders.put(path), owner,
                            update.deepCopy().put("maxPerAccount", 10), 409);
                }));
                await().atMost(Duration.ofSeconds(5)).until(() -> backendPid.isDone()
                        && jdbc.queryForObject("SELECT cardinality(pg_blocking_pids(?)) > 0",
                                Boolean.class, backendPid.join()));
                organizerRequest(MockMvcRequestBuilders.put(path), owner, update, 200);
                return request;
            });
            waiting.get(5, TimeUnit.SECONDS);
        }

        assertThat(catalog.event(event, owner).performances().getFirst().maxPerAccount()).isEqualTo(6);
    }

    @Test
    void publishesOnlyTheReviewedDraftAndLocksItWhileActivating() {
        var draft = newPerformance(3);
        tx(() -> catalog.saveSale(owner, owner, draft.id(), 0, maplessSale(draft.saleStartAt(), draft.saleEndAt())));
        var eventPath = ORGANIZER + "/events/" + event;
        var eventUpdate = json.createObjectNode().put("title", "Ready to publish").put("expectedDraftVersion", 0);
        organizerRequest(MockMvcRequestBuilders.put(eventPath), owner, eventUpdate, 200);
        var schedulePath = ORGANIZER + "/performances/" + draft.id() + "/schedule";
        var schedule = json.<ObjectNode>valueToTree(new PerformanceCatalog.Schedule(space, draft.startsAt(),
                draft.endsAt(), draft.doorsOpenAt(), draft.timezone(), draft.saleStartAt(), draft.saleEndAt(), 8, true));
        organizerRequest(MockMvcRequestBuilders.put(schedulePath), owner, schedule.put("expectedDraftVersion", 0), 200);
        var publishPath = ORGANIZER + "/performances/" + draft.id() + "/publication";
        var review = json.createObjectNode().put("expectedSaleVersion", 1).put("expectedLayoutVersion", 0)
                .put("expectedEventDraftVersion", 0).put("expectedScheduleDraftVersion", 0);
        organizerRequest(MockMvcRequestBuilders.post(publishPath), owner, review, 400);
        review.put("publishAt", OffsetDateTime.now(ZoneOffset.UTC).plusHours(1).toString());
        organizerRequest(MockMvcRequestBuilders.post(publishPath), owner, review, 409);
        organizerRequest(MockMvcRequestBuilders.post(publishPath), owner, review.put("expectedEventDraftVersion", 1), 409);
        var result = organizerRequest(MockMvcRequestBuilders.post(publishPath), owner,
                review.put("expectedScheduleDraftVersion", 1), 200);
        assertThat(result.path("status").asText()).isEqualTo("DRAFT");
        assertThat(result.path("review").path("state").asText()).isEqualTo("SUBMITTED");
        var revision = UUID.fromString(result.path("review").path("id").asText());
        var reviewer = UUID.randomUUID();
        tx(() -> reviews.decide(draft.id(), revision, reviewer, Action.APPROVE, null));
        tx(() -> { reviews.release(draft.id()); return null; });
        assertThat(tx(() -> catalog.publication(owner, draft.id())).status()).isEqualTo("DRAFT");
        jdbc.update("UPDATE performance_publication_reviews SET publish_at=clock_timestamp()-interval '1 second' WHERE id=?", revision);
        tx(() -> { reviews.release(draft.id()); return null; });
        assertThat(tx(() -> catalog.publication(owner, draft.id())).status()).isEqualTo("ON_SALE");
        assertThat(tx(() -> catalog.publication(owner, draft.id())).ticketingAcknowledged()).isFalse();
        organizerRequest(MockMvcRequestBuilders.put(eventPath), owner, eventUpdate.put("expectedDraftVersion", 1), 400);
        organizerRequest(MockMvcRequestBuilders.put(schedulePath), owner, schedule.put("expectedDraftVersion", 1), 400);
    }

    private static com.fasterxml.jackson.databind.JsonNode organizerRequest(
            MockHttpServletRequestBuilder request, UUID actor, ObjectNode data, int expectedStatus) {
        return tx(() -> {
            try {
                var response = organizer.perform(request.requestAttr(OrganizationAccess.ORGANIZATION, actor)
                                .principal(actor::toString)
                                .contentType(MediaType.APPLICATION_JSON).content(data.toString()))
                        .andExpect(status().is(expectedStatus)).andReturn().getResponse();
                return response.getContentAsString().isBlank() ? null
                        : json.readTree(response.getContentAsString()).path("data");
            } catch (Exception failure) {
                throw new AssertionError(failure);
            }
        });
    }

    @BeforeEach
    void draftEvent() {
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=true, checkin_ack=true");
        owner = UUID.randomUUID();
        event = tx(() -> catalog.createEvent(owner, "Two nights", "Tour", "music")).id();
        var created = tx(() -> catalog.createVenue(owner, "Room", "Address", "Stage"));
        venue = created.id();
        space = created.spaces().getFirst().id();
    }

    @Test
    void organizationRolloutOnlyControlsNewPublications() {
        var night = newPerformance(3);
        var draft = newPerformance(4);
        var enabled = new PerformanceCatalog(new JdbcPerformanceStore(jdbc, json), owner.toString());
        var disabled = new PerformanceCatalog(new JdbcPerformanceStore(jdbc, json), "");
        tx(() -> catalog.saveSale(owner, owner, night.id(), 0, maplessSale(night.saleStartAt(), night.saleEndAt())));
        assertThatThrownBy(() -> tx(() -> disabled.publish(owner, owner, night.id(), 1L, 0L, null, null)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.rollout-disabled");
        assertThat(tx(() -> enabled.publish(owner, owner, night.id(), 1L, 0L, null, null)).status()).isEqualTo("ON_SALE");
        assertThat(tx(() -> disabled.publish(owner, owner, night.id(), 2L, 0L, null, null)).saleVersion()).isEqualTo(2);
        assertThat(tx(() -> disabled.publication(owner, draft.id()).status())).isEqualTo("DRAFT");
    }

    @Test
    void requiresMatchingTicketingAcknowledgmentAndExposesOnlyTheRightPerformance() {
        var night = newPerformance(3);
        var draft = newPerformance(4);
        tx(() -> catalog.saveSale(owner, owner, night.id(), 0, maplessSale(night.saleStartAt(), night.saleEndAt())));
        assertThatThrownBy(() -> tx(() -> catalog.publish(owner, owner, night.id(), 0L, 0L, null, null)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");
        var publication = tx(() -> catalog.publish(owner, owner, night.id(), 1L, 0L, null, null));
        assertThat(publication.saleVersion()).isEqualTo(2);
        assertThatThrownBy(() -> catalog.event(event, null)).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> tx(() -> catalog.publication(UUID.randomUUID(), night.id())))
                .isInstanceOf(AppException.class);

        RestClient.Builder client = RestClient.builder();
        var receivers = MockRestServiceServer.bindTo(client).build();
        var publisher = new PerformancePublisher(jdbc, client.build(), json, "http://ticketing", "http://checkin");
        receivers.expect(requestTo(TICKETING + night.id())).andExpect(method(PUT))
                .andExpect(jsonPath("$.saleStartAt").isString()).andExpect(jsonPath("$.groups[1].kind").value("GA"))
                .andRespond(withSuccess("{\"version\":1}", MediaType.APPLICATION_JSON));
        receivers.expect(requestTo(CHECKIN + night.id())).andRespond(withServerError());
        publisher.publish();
        receivers.verify();
        assertThatThrownBy(() -> catalog.event(event, null)).isInstanceOf(AppException.class);
        assertThat(tx(() -> catalog.publication(owner, night.id())).ticketingAcknowledged()).isFalse();

        jdbc.update("""
                UPDATE performance_sale_publications SET ticketing_retry_at=now(),checkin_retry_at=now()
                WHERE performance_id=?
                """, night.id());
        receivers.reset();
        receivers.expect(requestTo(TICKETING + night.id()))
                .andRespond(withSuccess("{\"version\":2}", MediaType.APPLICATION_JSON));
        receivers.expect(requestTo(CHECKIN + night.id())).andRespond(withServerError());
        publisher.publish();
        receivers.verify();
        assertThat(tx(() -> catalog.publication(owner, night.id())).checkinAcknowledged()).isFalse();
        assertThat(catalog.event(event, null).performances()).extracting("id").containsExactly(night.id());
        assertThat(catalog.event(event, owner).performances()).extracting("id").containsExactly(night.id(), draft.id());
        assertThat(catalog.events(null, PageRequest.of(0, 10)).getContent()).extracting("id").contains(event);
    }

    @Test
    void templateCopiesHaveIndependentRevisionsAndPublishedSeatLabelsAreFrozen() {
        var night = newPerformance(3);
        var another = newPerformance(4);
        var source = assignedLayout();
        var template = tx(() -> catalog.createTemplate(owner, venue, space, "Original", source));
        var firstCopy = tx(() -> catalog.copyTemplate(owner, night.id(), template.id(), 1, 0));
        var secondCopy = tx(() -> catalog.copyTemplate(owner, another.id(), template.id(), 1, 0));
        assertThat(firstCopy.layout()).isEqualTo(secondCopy.layout());
        assertThatThrownBy(() -> tx(() -> catalog.saveLayout(owner, night.id(), 0, source)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");

        var section = source.sections().getFirst();
        var seat = section.rows().getFirst().seats().getFirst();
        var group = new PerformanceSale.Group(UUID.randomUUID(), section.id(), section.label(), Kind.ASSIGNED, 1,
                List.of(new PerformanceSale.Seat(seat.id(), "Row A", "Seat 1", false)));
        var offer = standard(group.id(), night.saleStartAt(), night.saleEndAt());
        tx(() -> catalog.saveSale(owner, owner, night.id(), 0, new PerformanceSale(List.of(group), List.of(offer))));
        tx(() -> catalog.publish(owner, owner, night.id(), 1L, 1L, null, null));
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=true WHERE performance_id=?", night.id());
        tx(() -> catalog.reviseTemplate(owner, venue, template.id(), 1,
                new PerformanceLayout(600, 600, null, List.of(), List.of())));
        assertThatThrownBy(() -> tx(() -> catalog.saveLayout(owner, night.id(), 1, source)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.layout-locked");
        assertThat(catalog.layoutOverview(night.id()).sections()).containsExactly(section.summary());
        assertThat(catalog.layoutSection(night.id(), section.id()).section().rows().getFirst().seats())
                .containsExactly(seat);
        assertThatThrownBy(() -> catalog.layoutOverview(another.id())).isInstanceOf(AppException.class);

        var revisedOffer = new PerformanceSale.Offer(offer.id(), offer.groupId(), offer.name(),
                BigDecimal.valueOf(200_000), offer.currency(), offer.saleStartAt(), offer.saleEndAt(), true);
        var revised = tx(() -> catalog.saveSale(owner, owner, night.id(), 2,
                new PerformanceSale(List.of(group), List.of(revisedOffer))));
        assertThat(revised.version()).isEqualTo(3);
        assertThat(jdbc.queryForObject("""
                SELECT count(DISTINCT payload->>'layoutChecksum') FROM performance_sale_publications WHERE performance_id=?
                """, Integer.class, night.id())).isEqualTo(1);
    }

    @Test
    void rejectsUnsafeLayoutGeometryAndInvalidOfferWindows() {
        var night = newPerformance(3);
        var source = assignedLayout();
        var section = source.sections().getFirst();
        var row = section.rows().getFirst();
        var seat = new PerformanceLayout.Seat(UUID.randomUUID(), "Outside", 59, 59, false, false, null, null, false);
        var outside = new PerformanceLayout.Section(section.id(), section.code(), section.label(), Kind.ASSIGNED,
                section.points(), List.of(new PerformanceLayout.Row(row.id(), row.code(), row.label(), List.of(seat))));
        assertThatThrownBy(() -> tx(() -> catalog.saveLayout(owner, night.id(), 0,
                new PerformanceLayout(60, 60, null, List.of(), List.of(outside)))))
                .isInstanceOf(DomainViolation.class).hasMessage("error.performance.seat-outside-section");
        assertThat(tx(() -> catalog.draftLayout(owner, night.id())).version()).isZero();
        assertThatThrownBy(() -> tx(() -> catalog.saveSale(owner, owner, night.id(), 0,
                maplessSale(night.saleStartAt().minusDays(1), night.saleEndAt()))))
                .isInstanceOf(DomainViolation.class).hasMessage("error.performance.invalid-offer-window");
        assertThat(tx(() -> catalog.sale(owner, night.id())).version()).isZero();
    }

    @Test
    void catalogPreventsAnOfferFromReferencingAnotherPerformancesStock() {
        var one = newPerformance(3);
        var two = newPerformance(4);
        var sale = maplessSale(one.saleStartAt(), one.saleEndAt());
        tx(() -> catalog.saveSale(owner, owner, one.id(), 0, sale));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_sale_offers WHERE performance_id=?",
                Integer.class, one.id())).isEqualTo(2);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO performance_sale_offers(
                    id,performance_id,group_id,name,price,currency,sale_start_at,sale_end_at,active,sort_index)
                VALUES (?,?,?,'Cross scope',1,'VND',?,?,true,0)
                """, UUID.randomUUID(), two.id(), sale.groups().getFirst().id(), two.saleStartAt(), two.saleEndAt()))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    private org.ticketbox.catalog.performance.application.PerformanceViews.Performance newPerformance(int days) {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(days).withNano(0);
        var schedule = new PerformanceCatalog.Schedule(space, starts, starts.plusHours(2), starts.minusHours(1),
                "Asia/Ho_Chi_Minh", starts.minusDays(2), starts.minusHours(2), 4, true);
        return tx(() -> catalog.createPerformance(owner, event, schedule));
    }

    private static PerformanceSale maplessSale(OffsetDateTime start, OffsetDateTime end) {
        var one = new PerformanceSale.Group(UUID.randomUUID(), null, "Floor", Kind.GA, 250, List.of());
        var two = new PerformanceSale.Group(UUID.randomUUID(), null, "Balcony", Kind.GA, 40, List.of());
        return new PerformanceSale(List.of(one, two), List.of(standard(one.id(), start, end),
                standard(two.id(), start, end)));
    }

    private static PerformanceSale.Offer standard(UUID pool, OffsetDateTime start, OffsetDateTime end) {
        return new PerformanceSale.Offer(UUID.randomUUID(), pool, "Standard", BigDecimal.valueOf(100_000),
                "VND", start, end, true);
    }

    private static PerformanceLayout assignedLayout() {
        var bounds = List.of(new Point(10, 10), new Point(50, 10), new Point(50, 50), new Point(10, 50));
        var seat = new PerformanceLayout.Seat(UUID.randomUUID(), "Seat 1", 25, 25, true, false, "front", 0, false);
        var row = new PerformanceLayout.Row(UUID.randomUUID(), "A", "Row A", List.of(seat));
        var section = new PerformanceLayout.Section(UUID.randomUUID(), "A", "Section A", Kind.ASSIGNED,
                bounds, List.of(row));
        return new PerformanceLayout(60, 60, null, List.of(), List.of(section));
    }

    private static <T> T tx(Supplier<T> action) {
        return transaction.execute(status -> action.get());
    }
}
