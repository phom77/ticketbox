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
import org.ticketbox.catalog.classification.application.ClassificationQuery;
import org.ticketbox.catalog.classification.domain.EventClassification;
import org.ticketbox.catalog.classification.infrastructure.JdbcClassificationStore;
import org.ticketbox.catalog.performance.web.OrganizerPerformanceController;
import org.ticketbox.catalog.performance.web.PerformanceOperationsController;
import org.ticketbox.catalog.performance.web.PublicPerformanceController;
import org.ticketbox.catalog.web.GlobalExceptionHandler;
import org.ticketbox.catalog.web.security.OrganizationAccess;

@Testcontainers
class PerformanceCatalogIntegrationTest {
    private static final EventClassification VPOP = new EventClassification("concerts", "vpop", List.of());
    private static final EventClassification STAND_UP =
            new EventClassification("arts-theater-comedy", "stand-up", List.of());
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final String TICKETING = "http://ticketing/internal/ticketing/catalog/performances/";
    private static final String CHECKIN = "http://checkin/internal/checkin/catalog/performances/";
    private static final String ORGANIZER = "/api/organizer/manage/v2";

    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static ObjectMapper json;
    private static PerformanceCatalog catalog;
    private static ClassificationQuery classifications;
    private static org.ticketbox.catalog.performance.application.EventContentService content;
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
        classifications = new ClassificationQuery(new JdbcClassificationStore(jdbc));
        catalog = new PerformanceCatalog(store, classifications, "*");
        content = new org.ticketbox.catalog.performance.application.EventContentService(
                store, new org.ticketbox.catalog.performance.infrastructure.JdbcEventContentStore(jdbc, json),
                new org.ticketbox.catalog.performance.EventContentIntegrationTest.FakePosters(), catalog, classifications);
        reviews = new PerformancePublicationReview(store, new JdbcPerformanceReviewStore(jdbc, json), catalog);
        organizer = MockMvcBuilders.standaloneSetup(new OrganizerPerformanceController(catalog, reviews, content), new PerformanceOperationsController(catalog),
                new org.ticketbox.catalog.performance.web.LegacyConcertCategoryController(catalog))
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
        var nativeEvent = tx(() -> catalog.createEvent(owner, "Đêm nhạc Duy Anh", "Tour", VPOP)).id();
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
        var nativeEvent = tx(() -> catalog.createEvent(owner, "Chương trình lọc suất", "Tour", VPOP)).id();
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
    void discoveryCardsCarryPriceCityCategoryAndDateCountAndFilterByThem() throws Exception {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(60).withNano(0);
        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts (id,title,venue_name,venue_address,event_date,sale_start_at,status,created_by)
                VALUES (?,'Facet showcase','Grand Hall','1 Main Street, Hanoi, Vietnam',?,?,'DRAFT',?)
                """, legacy, starts, starts.minusDays(1), owner);
        jdbc.update("INSERT INTO ticket_types (concert_id,name,price,total_quantity,available_qty) VALUES (?,'Standard',450000,10,10),(?,'Early',300000,10,10)",
                legacy, legacy);
        jdbc.update("UPDATE concerts SET status='ON_SALE' WHERE id=?", legacy);
        var nativeEvent = tx(() -> catalog.createEvent(owner, "Facet native", "Tour", STAND_UP)).id();
        discoveryShow(nativeEvent, starts.plusDays(1), starts.minusDays(4), true);
        discoveryShow(nativeEvent, starts.plusDays(2), starts.minusDays(3), true);

        var path = "/api/v2/events/discovery";
        var legacyCard = discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet showcase"))
                .path("content").get(0);
        assertThat(legacyCard.path("minPrice").asLong()).isEqualTo(300000);
        assertThat(legacyCard.path("city").asText()).isEqualTo("Hanoi");
        assertThat(legacyCard.path("performanceCount").asInt()).isEqualTo(1);

        var nativeCard = discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet native"))
                .path("content").get(0);
        assertThat(nativeCard.path("segment").asText()).isEqualTo("arts-theater-comedy");
        assertThat(nativeCard.path("primaryGenre").asText()).isEqualTo("stand-up");
        assertThat(nativeCard.path("category").asText()).isEqualTo("arts-theater-comedy");
        assertThat(nativeCard.path("performanceCount").asInt()).isEqualTo(2);
        assertThat(nativeCard.path("minPrice").isNull()).isFalse();

        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet").param("city", "HANOI"))
                .path("totalElements").asInt()).isEqualTo(1);
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet").param("city", "Hue"))
                .path("totalElements").asInt()).isZero();
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet").param("category", "Comedy"))
                .path("totalElements").asInt()).isEqualTo(1);
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet showcase").param("minPrice", "400000"))
                .path("totalElements").asInt()).isZero();
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "facet showcase").param("maxPrice", "300000"))
                .path("totalElements").asInt()).isEqualTo(1);
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("minPrice", "9").param("maxPrice", "1"))
                .andExpect(status().isBadRequest());
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("minPrice", "cheap"))
                .andExpect(status().isBadRequest());

        var facets = discoveryPage(MockMvcRequestBuilders.get(path + "/facets"));
        assertThat(facets.path("cities").toString()).contains("Hanoi");
        assertThat(facets.path("categories").toString()).contains("arts-theater-comedy");
        assertThat(facets.path("segments").toString()).contains("arts-theater-comedy");
        assertThat(facets.path("genres").toString()).contains("stand-up");
    }

    @Test
    void storesOnlyFixedEventCategoriesAndFiltersDiscoveryByThem() throws Exception {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(70).withNano(0);
        var unknown = json.createObjectNode().put("title", "Category gala").put("category", "opera-gala");
        organizerRequest(MockMvcRequestBuilders.post(ORGANIZER + "/events"), owner, unknown, 400);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM events WHERE title='Category gala'", Integer.class)).isZero();

        var legacyInput = organizerRequest(MockMvcRequestBuilders.post(ORGANIZER + "/events"), owner,
                json.createObjectNode().put("title", "Category legacy input").put("category", "comedy"), 200);
        assertThat(legacyInput.path("segment").asText()).isEqualTo("arts-theater-comedy");
        assertThat(legacyInput.path("primaryGenre").asText()).isEqualTo("stand-up");
        var sports = organizerRequest(MockMvcRequestBuilders.post(ORGANIZER + "/events"), owner,
                json.createObjectNode().put("title", "Category derby").put("category", "family")
                        .put("segment", "sports").put("primaryGenre", "football"), 200);
        var none = organizerRequest(MockMvcRequestBuilders.post(ORGANIZER + "/events"), owner,
                json.createObjectNode().put("title", "Category open mic").put("category", " "), 200);
        assertThat(sports.path("category").asText()).isEqualTo("sports");
        assertThat(none.path("category").isNull()).isTrue();
        discoveryShow(UUID.fromString(sports.path("id").asText()), starts, starts.minusDays(4), true);

        var path = "/api/v2/events/discovery";
        var page = discoveryPage(MockMvcRequestBuilders.get(path).param("category", "sports").param("q", "category"));
        assertThat(page.path("totalElements").asInt()).isEqualTo(1);
        assertThat(page.path("content").get(0).path("category").asText()).isEqualTo("sports");
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("category", "family").param("q", "category"))
                .path("totalElements").asInt()).isZero();
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path + "/facets")).path("categories").toString())
                .contains("sports");
    }

    @Test
    void setsTheCategoryOfALegacyConcertThroughItsMappedEvent() {
        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts (id,title,venue_name,venue_address,event_date,status,created_by,organization_id)
                VALUES (?,'Legacy category','Hall','Main Street',now() + interval '40 days','DRAFT',?,?)
                """, legacy, owner, owner);
        var path = "/api/organizer/manage/concerts/" + legacy + "/category";
        assertThat(organizerRequest(MockMvcRequestBuilders.get(path), owner, json.createObjectNode(), 200)
                .path("category").isNull()).isTrue();
        organizerRequest(MockMvcRequestBuilders.put(path), owner, json.createObjectNode().put("category", "bogus"), 400);
        organizerRequest(MockMvcRequestBuilders.put(path), UUID.randomUUID(),
                json.createObjectNode().put("category", "family"), 404);
        var saved = organizerRequest(MockMvcRequestBuilders.put(path), owner,
                json.createObjectNode().put("category", "family"), 200);
        assertThat(saved.path("category").asText()).isEqualTo("family");
        assertThat(jdbc.queryForObject("SELECT segment_id FROM events WHERE id=?", String.class, legacy))
                .isEqualTo("family");
        assertThat(catalog.setLegacyEventCategory(legacy, null, null).category()).isNull();
        assertThat(jdbc.queryForObject("SELECT segment_id FROM events WHERE id=?", String.class, legacy)).isNull();
    }

    @Test
    void settingTheLegacyCategoryKeepsGenresWhileTheSegmentIsUnchangedAndBumpsTheContentVersion() {
        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts (id,title,venue_name,venue_address,event_date,status,created_by,organization_id)
                VALUES (?,'Legacy keeps genre','Hall','Main Street',now() + interval '40 days','DRAFT',?,?)
                """, legacy, owner, owner);
        catalog.setLegacyEventCategory(legacy, null, "concerts");
        UUID mapped = jdbc.queryForObject("SELECT id FROM events WHERE legacy_concert_id=?", UUID.class, legacy);
        jdbc.update("UPDATE events SET primary_genre_id='vpop' WHERE id=?", mapped);
        jdbc.update("INSERT INTO event_genres(event_id, genre_id, sort) VALUES (?, 'indie', 0)", mapped);
        long version = jdbc.queryForObject("SELECT content_version FROM events WHERE id=?", Long.class, mapped);

        catalog.setLegacyEventCategory(legacy, null, "concerts");
        assertThat(jdbc.queryForObject("SELECT primary_genre_id FROM events WHERE id=?", String.class, mapped)).isEqualTo("vpop");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_genres WHERE event_id=?", Integer.class, mapped)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT content_version FROM events WHERE id=?", Long.class, mapped)).isEqualTo(version + 1);

        catalog.setLegacyEventCategory(legacy, null, "sports");
        assertThat(jdbc.queryForObject("SELECT segment_id FROM events WHERE id=?", String.class, mapped)).isEqualTo("sports");
        assertThat(jdbc.queryForObject("SELECT primary_genre_id FROM events WHERE id=?", String.class, mapped)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_genres WHERE event_id=?", Integer.class, mapped)).isZero();
        assertThat(jdbc.queryForObject("SELECT content_version FROM events WHERE id=?", Long.class, mapped)).isEqualTo(version + 2);
    }

    @Test
    void discoveryFiltersBySegmentAndGenreAcrossPrimaryAndTagUseAndCountsEachEventOnce() throws Exception {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(80).withNano(0);
        var before = discoveryPage(MockMvcRequestBuilders.get("/api/v2/events/discovery/facets"));
        var beforeConcerts = discoveryPage(MockMvcRequestBuilders.get("/api/v2/events/discovery/facets")
                .param("segment", "concerts")).path("genres");
        var beforeFestivals = discoveryPage(MockMvcRequestBuilders.get("/api/v2/events/discovery/facets")
                .param("segment", "festivals")).path("genres");
        var rock = tx(() -> catalog.createEvent(owner, "Genre rock night", "Tour",
                new EventClassification("concerts", "rock", List.of("indie", "edm")))).id();
        var festival = tx(() -> catalog.createEvent(owner, "Genre summer fest", "Tour",
                new EventClassification("festivals", "music-festival", List.of("rock")))).id();
        var football = tx(() -> catalog.createEvent(owner, "Genre derby", "Tour",
                new EventClassification("sports", "football", List.of()))).id();
        for (var id : List.of(rock, festival, football)) {
            discoveryShow(id, starts, starts.minusDays(4), true);
            discoveryShow(id, starts.plusDays(1), starts.minusDays(4), true);
        }
        var path = "/api/v2/events/discovery";
        assertThat(titles(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "genre").param("segment", "concerts"))))
                .containsExactly("Genre rock night");
        // The rock genre matches a primary genre and a tag; each event is counted once.
        var rockPage = discoveryPage(MockMvcRequestBuilders.get(path).param("q", "genre").param("genre", "rock"));
        assertThat(rockPage.path("totalElements").asInt()).isEqualTo(2);
        assertThat(titles(rockPage)).containsExactlyInAnyOrder("Genre rock night", "Genre summer fest");
        assertThat(titles(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "genre").param("genre", "indie"))))
                .containsExactly("Genre rock night");
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "genre").param("segment", "festivals")
                .param("genre", "rock")).path("totalElements").asInt()).isEqualTo(1);
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "genre").param("segment", "sports")
                .param("genre", "rock")).path("totalElements").asInt()).isZero();
        assertThat(discoveryPage(MockMvcRequestBuilders.get(path).param("q", "genre").param("category", "sports"))
                .path("totalElements").asInt()).isEqualTo(1);
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("segment", "opera")).andExpect(status().isBadRequest());
        publicCatalog.perform(MockMvcRequestBuilders.get(path).param("genre", "nonsense")).andExpect(status().isBadRequest());

        var facets = discoveryPage(MockMvcRequestBuilders.get(path + "/facets"));
        // Facet counts include other tests' events, so compare the change: two events use rock (primary and tag).
        assertThat(count(facets.path("genres"), "id", "rock") - count(before.path("genres"), "id", "rock")).isEqualTo(2);
        assertThat(count(facets.path("genres"), "id", "indie") - count(before.path("genres"), "id", "indie")).isEqualTo(1);
        assertThat(count(facets.path("genres"), "id", "football") - count(before.path("genres"), "id", "football"))
                .isEqualTo(1);
        assertThat(facets.path("genres").toString()).contains("\"segmentId\":\"festivals\"");
        assertThat(count(facets.path("segments"), "id", "sports") - count(before.path("segments"), "id", "sports"))
                .isEqualTo(1);
        assertThat(count(facets.path("segments"), "id", "concerts") - count(before.path("segments"), "id", "concerts"))
                .isEqualTo(1);
        assertThat(facets.path("categories").toString()).contains("sports");

        // With a segment, genre counts cover that segment's events only, primary or tag, tags from any segment included.
        var concerts = discoveryPage(MockMvcRequestBuilders.get(path + "/facets").param("segment", "concerts")).path("genres");
        assertThat(count(concerts, "id", "rock") - count(beforeConcerts, "id", "rock")).isEqualTo(1);
        assertThat(count(concerts, "id", "indie") - count(beforeConcerts, "id", "indie")).isEqualTo(1);
        assertThat(count(concerts, "id", "football") - count(beforeConcerts, "id", "football")).isZero();
        var festivals = discoveryPage(MockMvcRequestBuilders.get(path + "/facets").param("segment", "festivals")).path("genres");
        assertThat(count(festivals, "id", "music-festival") - count(beforeFestivals, "id", "music-festival")).isEqualTo(1);
        assertThat(count(festivals, "id", "rock") - count(beforeFestivals, "id", "rock")).isEqualTo(1);
        assertThat(festivals.toString()).contains("\"id\":\"rock\",\"segmentId\":\"concerts\"");
        assertThat(count(festivals, "id", "football") - count(beforeFestivals, "id", "football")).isZero();
        publicCatalog.perform(MockMvcRequestBuilders.get(path + "/facets").param("segment", "opera"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void submittingForReleaseNeedsASegmentAndAPrimaryGenre() throws Exception {
        var bare = tx(() -> catalog.createEvent(owner, "Unclassified", "Tour", null)).id();
        var segmentOnly = tx(() -> catalog.createEvent(owner, "Segment only", "Tour",
                new EventClassification("sports", null, List.of()))).id();
        for (var id : List.of(bare, segmentOnly)) {
            var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(30).withNano(0);
            var performance = tx(() -> catalog.createPerformance(owner, id, new PerformanceCatalog.Schedule(space, starts,
                    starts.plusHours(2), null, "Asia/Ho_Chi_Minh", starts.minusDays(3), starts.minusHours(1), 4, true)));
            tx(() -> catalog.saveSale(owner, owner, performance.id(), 0,
                    maplessSale(performance.saleStartAt(), performance.saleEndAt())));
            var versions = new org.ticketbox.catalog.performance.application.PerformanceReviewStore.Versions(
                    1, 0, catalog.event(id, owner).draftVersion(), performance.draftVersion());
            assertThatThrownBy(() -> tx(() -> reviews.submit(owner, owner, performance.id(), versions,
                    OffsetDateTime.now(ZoneOffset.UTC).plusHours(1))))
                    .isInstanceOf(AppException.class).hasMessage("error.performance.classification-missing");
        }
        tx(() -> catalog.updateDraftEvent(owner, segmentOnly, 0L, "Segment only", "Tour",
                new EventClassification("sports", "football", List.of())));
        var performance = jdbc.queryForObject("SELECT id FROM performances WHERE event_id=?", UUID.class, segmentOnly);
        assertThat(tx(() -> catalog.publish(owner, owner, performance, 1L, 0L, null, null)).status()).isEqualTo("ON_SALE");
        var payload = json.readTree(jdbc.queryForObject(
                "SELECT payload FROM performance_sale_publications WHERE performance_id=? AND version=2", String.class, performance));
        assertThat(payload.path("segment").asText()).isEqualTo("sports");
        assertThat(payload.path("primaryGenre").asText()).isEqualTo("football");
    }

    private static List<String> titles(com.fasterxml.jackson.databind.JsonNode page) {
        var values = new java.util.ArrayList<String>();
        page.path("content").forEach(card -> values.add(card.path("title").asText()));
        return values;
    }

    private static int count(com.fasterxml.jackson.databind.JsonNode entries, String key, String value) {
        for (var entry : entries) if (value.equals(entry.path(key).asText())) return entry.path("count").asInt();
        return 0;
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
        var update = json.createObjectNode().put("title", "Third night").put("segment", "concerts").put("primaryGenre", "vpop")
                .put("expectedContentVersion", 0);
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
        var eventUpdate = json.createObjectNode().put("title", "Ready to publish").put("expectedContentVersion", 0);
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
        organizerRequest(MockMvcRequestBuilders.put(eventPath), owner, eventUpdate.put("expectedContentVersion", 1), 400);
        organizerRequest(MockMvcRequestBuilders.put(schedulePath), owner, schedule.put("expectedDraftVersion", 1), 400);
    }

    private UUID approvedReview(org.ticketbox.catalog.performance.application.PerformanceViews.Performance draft) {
        tx(() -> catalog.saveSale(owner, owner, draft.id(), 0, maplessSale(draft.saleStartAt(), draft.saleEndAt())));
        var current = catalog.event(event, owner);
        var versions = new org.ticketbox.catalog.performance.application.PerformanceReviewStore.Versions(
                1, 0, current.draftVersion(), draft.draftVersion());
        var submitted = tx(() -> reviews.submit(owner, owner, draft.id(), versions,
                OffsetDateTime.now(ZoneOffset.UTC).plusHours(1)));
        UUID revision = submitted.review().id();
        tx(() -> reviews.decide(draft.id(), revision, UUID.randomUUID(), Action.APPROVE, null));
        jdbc.update("UPDATE performance_publication_reviews SET publish_at=clock_timestamp()-interval '1 second' WHERE id=?",
                revision);
        return revision;
    }

    private String reviewState(UUID performance) {
        return tx(() -> reviews.status(owner, performance)).review().state().name();
    }

    @Test
    void approvingAContentRevisionKeepsAScheduledReleaseAndResyncsTheTitleOfReleasedShows() {
        var first = newPerformance(3);
        var second = newPerformance(4);
        tx(() -> catalog.saveSale(owner, owner, first.id(), 0, maplessSale(first.saleStartAt(), first.saleEndAt())));
        tx(() -> catalog.publish(owner, owner, first.id(), 1L, 0L, null, null));
        approvedReview(second);
        long draftVersion = catalog.event(event, owner).draftVersion();

        var input = new org.ticketbox.catalog.performance.application.EventContentService.Input(
                "Renamed show", "New text", null, java.util.Map.of(), null, null, null);
        tx(() -> content.stage(owner, event, 0L, input));
        tx(() -> content.submit(owner, owner, event, 1L));
        tx(() -> content.decide(UUID.randomUUID(), event,
                org.ticketbox.catalog.performance.domain.EventContentRevision.Action.APPROVE, null, 1));

        assertThat(catalog.event(event, owner).title()).isEqualTo("Renamed show");
        assertThat(catalog.event(event, owner).draftVersion()).isEqualTo(draftVersion);
        assertThat(reviewState(second.id())).isEqualTo("SCHEDULED");
        tx(() -> { reviews.release(second.id()); return null; });
        assertThat(tx(() -> catalog.publication(owner, second.id())).status()).isEqualTo("ON_SALE");
        assertThat(reviewState(second.id())).isEqualTo("RELEASED");

        // The released show got a new snapshot version carrying the approved title.
        var versions = jdbc.queryForList("SELECT version FROM performance_sale_publications WHERE performance_id=? ORDER BY version",
                Long.class, first.id());
        assertThat(versions).containsExactly(2L, 3L);
        assertThat(jdbc.queryForObject("SELECT payload->>'title' FROM performance_sale_publications WHERE performance_id=? AND version=3",
                String.class, first.id())).isEqualTo("Renamed show");
        assertThat(tx(() -> catalog.publication(owner, first.id())).saleVersion()).isEqualTo(3);
    }

    @Test
    void everyPreReleaseContentWriteSupersedesAPendingReview() {
        var plain = newPerformance(3);
        approvedReview(plain);
        var event0 = catalog.event(event, owner);
        var bio = new org.ticketbox.catalog.performance.application.EventContentService.Input(
                event0.title(), event0.description(), "concerts", java.util.Map.of(), "A bio", "ALL", null);
        var after = tx(() -> content.updateDraft(owner, event, event0.contentVersion(), bio));
        assertThat(after.draftVersion()).isEqualTo(event0.draftVersion() + 1);
        tx(() -> { reviews.release(plain.id()); return null; });
        assertThat(reviewState(plain.id())).isEqualTo("SUPERSEDED");
    }

    @Test
    void aPreReleasePosterChangeSupersedesAPendingReview() {
        var show = newPerformance(3);
        approvedReview(show);
        var event0 = catalog.event(event, owner);
        var upload = new org.ticketbox.catalog.support.TestUpload("file", "poster.png", "image/png", new byte[] {1});
        var after = tx(() -> content.replacePoster(owner, event, event0.contentVersion(), null, upload)).event();
        assertThat(after.draftVersion()).isEqualTo(event0.draftVersion() + 1);
        tx(() -> { reviews.release(show.id()); return null; });
        assertThat(reviewState(show.id())).isEqualTo("SUPERSEDED");
    }

    @Test
    void aPreReleaseTitleChangeSupersedesAPendingReview() {
        var show = newPerformance(3);
        UUID review = approvedReview(show);
        var event0 = catalog.event(event, owner);
        var renamed = new org.ticketbox.catalog.performance.application.EventContentService.Input(
                "Another title", event0.description(), "concerts", java.util.Map.of(), null, null, null);
        var after = tx(() -> content.updateDraft(owner, event, event0.contentVersion(), renamed));
        assertThat(after.draftVersion()).isEqualTo(event0.draftVersion() + 1);
        tx(() -> { reviews.release(show.id()); return null; });
        assertThat(reviewState(show.id())).isEqualTo("SUPERSEDED");
        assertThat(tx(() -> catalog.publication(owner, show.id())).status()).isEqualTo("DRAFT");
        assertThat(review).isNotNull();
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
        event = tx(() -> catalog.createEvent(owner, "Two nights", "Tour", VPOP)).id();
        var created = tx(() -> catalog.createVenue(owner, "Room", "Address", "Stage"));
        venue = created.id();
        space = created.spaces().getFirst().id();
    }

    @Test
    void organizationRolloutOnlyControlsNewPublications() {
        var night = newPerformance(3);
        var draft = newPerformance(4);
        var enabled = new PerformanceCatalog(new JdbcPerformanceStore(jdbc, json), classifications, owner.toString());
        var disabled = new PerformanceCatalog(new JdbcPerformanceStore(jdbc, json), classifications, "");
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
