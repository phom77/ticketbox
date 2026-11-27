package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.port.Upload;
import org.ticketbox.catalog.classification.application.ClassificationQuery;
import org.ticketbox.catalog.classification.domain.EventClassification;
import org.ticketbox.catalog.classification.infrastructure.JdbcClassificationStore;
import org.ticketbox.catalog.concert.application.port.PosterStorage;
import org.ticketbox.catalog.content.domain.ConcertText;
import org.ticketbox.catalog.domain.DomainViolation;
import org.ticketbox.catalog.performance.application.EventContentService;
import org.ticketbox.catalog.performance.application.EventContentService.Input;
import org.ticketbox.catalog.performance.application.EventDrafts;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;
import org.ticketbox.catalog.performance.application.PerformanceViews;
import org.ticketbox.catalog.performance.application.WorkspaceOperations;
import org.ticketbox.catalog.performance.application.WorkspaceOperationsStore.EventFilters;
import org.ticketbox.catalog.performance.application.WorkspaceOperationsStore.EventStatus;
import org.ticketbox.catalog.performance.domain.EventContentRevision.Action;
import org.ticketbox.catalog.performance.domain.EventContentRevision.State;
import org.ticketbox.catalog.performance.infrastructure.JdbcEventContentStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcWorkspaceOperationsStore;
import org.ticketbox.catalog.performance.web.AdminEventContentController;
import org.ticketbox.catalog.performance.web.OrganizerEventContentController;
import org.ticketbox.catalog.performance.web.PublicPerformanceController;
import org.ticketbox.catalog.support.TestUpload;
import org.ticketbox.catalog.web.GlobalExceptionHandler;
import org.ticketbox.catalog.web.security.OrganizationAccess;

@Testcontainers
class EventContentIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final String ORGANIZER = "/api/organizer/manage/v2";

    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static ObjectMapper json;
    private static JdbcPerformanceStore store;
    private static WorkspaceOperations operations;
    private final FakePosters posters = new FakePosters();
    private final UUID actor = UUID.randomUUID();
    private final UUID owner = UUID.randomUUID();
    private final UUID other = UUID.randomUUID();
    private UUID space;
    private EventContentService content;
    private EventDrafts drafts;
    private PerformanceCatalog catalog;
    private PerformancePublicationReview reviews;
    private ClassificationQuery classifications;
    private MockMvc organizer;
    private MockMvc admin;
    private MockMvc correct;
    private MockMvc buyer;

    @BeforeAll
    static void migrate() {
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).load().migrate();
        jdbc = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        json = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        store = new JdbcPerformanceStore(jdbc, json);
        operations = new WorkspaceOperations(new JdbcWorkspaceOperationsStore(jdbc));
    }

    @BeforeEach
    void setup() {
        var contents = new JdbcEventContentStore(jdbc, json);
        classifications = new ClassificationQuery(new JdbcClassificationStore(jdbc));
        catalog = new PerformanceCatalog(store, classifications, "*");
        content = new EventContentService(store, contents, posters, catalog, classifications);
        reviews = new PerformancePublicationReview(store,
                new org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceReviewStore(jdbc, json), catalog);
        drafts = new EventDrafts(store, contents, posters, eventId -> () -> {});
        var converters = new MappingJackson2HttpMessageConverter(json);
        organizer = MockMvcBuilders.standaloneSetup(new OrganizerEventContentController(content, drafts, null))
                .setControllerAdvice(new GlobalExceptionHandler()).setMessageConverters(converters).build();
        admin = MockMvcBuilders.standaloneSetup(new AdminEventContentController(content))
                .setControllerAdvice(new GlobalExceptionHandler()).setMessageConverters(converters).build();
        correct = MockMvcBuilders.standaloneSetup(new org.ticketbox.catalog.performance.web.AdminEventClassificationController(content))
                .setControllerAdvice(new GlobalExceptionHandler()).setMessageConverters(converters).build();
        buyer = MockMvcBuilders.standaloneSetup(new PublicPerformanceController(catalog))
                .setControllerAdvice(new GlobalExceptionHandler()).setMessageConverters(converters).build();
        UUID venue = UUID.randomUUID();
        space = UUID.randomUUID();
        jdbc.update("INSERT INTO venues(id,organization_id,name,address) VALUES (?,?,'Theater','District One')", venue, owner);
        jdbc.update("INSERT INTO venue_spaces(id,venue_id,name) VALUES (?,?,'Stage')", space, venue);
    }

    private Input input(String title, String description) {
        return new Input(title, description, null, "concerts", "vpop", List.of("indie"),
                Map.of("vi", new ConcertText("Đêm nhạc", "Mô tả"), "en", new ConcertText("Night", "About")),
                "Bio text", "16+", "Refunds up to 7 days before.");
    }

    @Test
    void draftContentIsSavedValidatedAndShownToBuyers() throws Exception {
        var created = tx(() -> content.create(owner, input("Native show", "First description")));
        assertThat(created.ageRating()).isEqualTo("16+");
        assertThat(created.refundPolicy()).startsWith("Refunds");
        assertThat(created.artistBio()).isEqualTo("Bio text");
        assertThat(created.translations().get("vi").title()).isEqualTo("Đêm nhạc");

        assertThatThrownBy(() -> tx(() -> content.updateDraft(owner, created.id(), created.contentVersion(),
                new Input("Native show", null, "concerts", Map.of(), null, "21+", null))))
                .isInstanceOf(DomainViolation.class).hasMessage("error.event-content.invalid-age-rating");
        assertThatThrownBy(() -> tx(() -> content.updateDraft(owner, created.id(), created.contentVersion(),
                new Input("Native show", null, "concerts", Map.of("fr", new ConcertText("x", null)), null, null, null))))
                .isInstanceOf(DomainViolation.class).hasMessage("validation.concert.translation-language");
        assertThatThrownBy(() -> tx(() -> content.updateDraft(owner, created.id(), created.contentVersion() + 5,
                input("Native show", "x")))).isInstanceOf(AppException.class)
                .hasMessage("error.performance.version-conflict");

        var withPoster = tx(() -> content.replacePoster(owner, created.id(), created.contentVersion(), null,
                new TestUpload("file", "poster.png", "image/png", new byte[] {1}))).event();
        assertThat(withPoster.posterUrl()).isEqualTo("https://cdn.test/1");
        assertThat(withPoster.contentVersion()).isGreaterThan(created.contentVersion());

        // Not public until a performance is released.
        buyer.perform(get("/api/v2/events/" + created.id())).andExpect(status().isNotFound());
        released(created.id(), 5);
        buyer.perform(get("/api/v2/events/" + created.id())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.posterUrl").value("https://cdn.test/1"))
                .andExpect(jsonPath("$.data.translations.en.title").value("Night"))
                .andExpect(jsonPath("$.data.artistBio").value("Bio text"))
                .andExpect(jsonPath("$.data.ageRating").value("16+"))
                .andExpect(jsonPath("$.data.refundPolicy").value("Refunds up to 7 days before."));
        buyer.perform(get("/api/v2/events/discovery").param("q", "dem nhac"))
                .andExpect(jsonPath("$.data.content[0].posterUrl").value("https://cdn.test/1"))
                .andExpect(jsonPath("$.data.content[0].translations.vi.title").value("Đêm nhạc"));
    }

    @Test
    void classificationIsValidatedSavedAndOmittedFieldsKeepIt() {
        var created = tx(() -> content.create(owner, input("Classified show", "x")));
        assertThat(created.segment()).isEqualTo("concerts");
        assertThat(created.primaryGenre()).isEqualTo("vpop");
        assertThat(created.genres()).containsExactly("indie");
        assertThat(created.category()).isEqualTo("concerts");

        record Bad(String segment, String primary, List<String> tags, String message) {}
        for (var bad : List.of(
                new Bad("opera", null, null, "error.classification.unknown-segment"),
                new Bad("festivals", "vpop", null, "error.classification.genre-outside-segment"),
                new Bad(null, "vpop", null, "error.classification.genre-outside-segment"),
                new Bad("concerts", "nonsense", null, "error.classification.unknown-genre"),
                new Bad("concerts", "vpop", List.of("rock", "edm", "jazz", "kpop"), "error.classification.too-many-tags"),
                new Bad("concerts", "vpop", List.of("vpop"), "error.classification.unknown-genre"),
                new Bad("concerts", "vpop", List.of("rock", "rock"), "error.classification.unknown-genre"))) {
            assertThatThrownBy(() -> tx(() -> content.create(owner, new Input("Bad", null, null, bad.segment(),
                    bad.primary(), bad.tags(), Map.of(), null, null, null))))
                    .isInstanceOf(DomainViolation.class).hasMessage(bad.message());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM events WHERE title='Bad'", Integer.class)).isZero();

        // Tags may come from any segment; leaving the classification out keeps it; blank values clear it.
        var tagged = tx(() -> content.updateDraft(owner, created.id(), created.contentVersion(), new Input("Classified show",
                "x", null, "festivals", "music-festival", List.of("edm", "indie", "football"), Map.of(), null, null, null)));
        assertThat(tagged.genres()).containsExactly("edm", "indie", "football");
        var kept = tx(() -> content.updateDraft(owner, created.id(), tagged.contentVersion(),
                new Input("Classified show", "y", null, null, null, null, Map.of(), null, null, null)));
        assertThat(kept.segment()).isEqualTo("festivals");
        assertThat(kept.genres()).containsExactly("edm", "indie", "football");
        var cleared = tx(() -> content.updateDraft(owner, created.id(), kept.contentVersion(),
                new Input("Classified show", "y", null, "", "", List.of(), Map.of(), null, null, null)));
        assertThat(cleared.segment()).isNull();
        assertThat(cleared.genres()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_genres WHERE event_id=?", Integer.class, created.id()))
                .isZero();
        // A segment alone is a valid draft, and the old category input still maps.
        var segmentOnly = tx(() -> content.updateDraft(owner, created.id(), cleared.contentVersion(),
                new Input("Classified show", "y", null, "sports", null, null, Map.of(), null, null, null)));
        assertThat(segmentOnly.segment()).isEqualTo("sports");
        assertThat(segmentOnly.primaryGenre()).isNull();
        var comedy = tx(() -> content.updateDraft(owner, created.id(), segmentOnly.contentVersion(),
                new Input("Classified show", "y", "comedy", Map.of(), null, null, null)));
        assertThat(comedy.segment()).isEqualTo("arts-theater-comedy");
        assertThat(comedy.primaryGenre()).isEqualTo("stand-up");
        assertThat(comedy.draftVersion()).isGreaterThan(created.draftVersion());
    }

    @Test
    void retiredGenresStayOnExistingEventsButCannotBeAssignedAgain() {
        var event = tx(() -> content.create(owner, new Input("Retired genre show", null, null, "concerts", "jazz",
                List.of(), Map.of(), null, null, null)));
        jdbc.update("UPDATE classification_genres SET active=false WHERE id='jazz'");
        try {
            var fresh = new ClassificationQuery(new JdbcClassificationStore(jdbc));
            var service = new EventContentService(store, new JdbcEventContentStore(jdbc, json), posters, catalog, fresh);
            assertThat(fresh.active().stream().flatMap(segment -> segment.genres().stream()).map(genre -> genre.id()))
                    .doesNotContain("jazz");
            var unchanged = tx(() -> service.updateDraft(owner, event.id(), event.contentVersion(), new Input(
                    "Retired genre show", "edited", null, "concerts", "jazz", List.of(), Map.of(), null, null, null)));
            assertThat(unchanged.primaryGenre()).isEqualTo("jazz");
            assertThatThrownBy(() -> tx(() -> service.create(owner, new Input("Another", null, null, "concerts", "jazz",
                    List.of(), Map.of(), null, null, null))))
                    .isInstanceOf(DomainViolation.class).hasMessage("error.classification.inactive-genre");
            assertThatThrownBy(() -> tx(() -> service.updateDraft(owner, event.id(), unchanged.contentVersion(),
                    new Input("Retired genre show", "edited", null, "concerts", "vpop", List.of("jazz", "rock"), Map.of(),
                            null, null, null)))).isInstanceOf(DomainViolation.class)
                    .hasMessage("error.classification.inactive-genre");
        } finally {
            jdbc.update("UPDATE classification_genres SET active=true WHERE id='jazz'");
        }
    }

    @Test
    void releasedEventsStageClassificationAndOnlySegmentOrPrimaryChangesReissueSnapshots() {
        var event = tx(() -> content.create(owner, input("Reclassified show", "x")));
        var performance = published(event.id(), 20);
        assertThat(publications(performance)).isEqualTo(1);
        var reviewer = UUID.randomUUID();

        // Organizers cannot change the live classification directly; the change waits for approval.
        var staged = tx(() -> content.stage(owner, event.id(), 0L, new Input("Reclassified show", "x", null, "festivals",
                "music-festival", List.of("indie", "rock"), Map.of(), null, null, null)));
        assertThat(staged.revision().content().classification().segment()).isEqualTo("festivals");
        assertThat(store.previewEvent(event.id(), null).orElseThrow().segment()).isEqualTo("concerts");
        // Omitting the classification in a later edit keeps the staged one.
        var again = tx(() -> content.stage(owner, event.id(), 1L, new Input("Reclassified show", "x2", null, null, null,
                null, Map.of(), null, null, null)));
        assertThat(again.revision().content().classification().primaryGenre()).isEqualTo("music-festival");
        tx(() -> content.submit(owner, actor, event.id(), 2L));
        var approved = tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 2));
        assertThat(approved.event().segment()).isEqualTo("festivals");
        assertThat(approved.event().primaryGenre()).isEqualTo("music-festival");
        assertThat(approved.event().genres()).containsExactly("indie", "rock");
        assertThat(publications(performance)).isEqualTo(2);
        var payload = latestPayload(performance);
        assertThat(payload.path("segment").asText()).isEqualTo("festivals");
        assertThat(payload.path("primaryGenre").asText()).isEqualTo("music-festival");
        assertThat(payload.has("city")).isTrue();

        // A tag-only change is applied after approval but does not re-issue the snapshot.
        tx(() -> content.stage(owner, event.id(), 2L, new Input("Reclassified show", "x2", null, "festivals",
                "music-festival", List.of("edm"), Map.of(), null, null, null)));
        tx(() -> content.submit(owner, actor, event.id(), 3L));
        tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 3));
        assertThat(store.previewEvent(event.id(), null).orElseThrow().genres()).containsExactly("edm");
        assertThat(publications(performance)).isEqualTo(2);
    }

    @Test
    void adminCorrectsClassificationWithAVersionCheckAnAuditAndASnapshotReissue() throws Exception {
        var event = tx(() -> content.create(owner, input("Corrected show", "x")));
        var performance = published(event.id(), 20);
        var path = "/api/admin/events/" + event.id() + "/classification";
        long version = cv(event.id());
        var body = json.createObjectNode().put("segment", "sports").put("primaryGenre", "football")
                .put("expectedContentVersion", version);
        body.putArray("genres").add("esports");
        var stale = json.createObjectNode().put("segment", "sports").put("expectedContentVersion", version + 9);
        correct.perform(put(path).contentType("application/json").content(stale.toString()).principal(() -> actor.toString()))
                .andExpect(status().isConflict());
        correct.perform(put(path).contentType("application/json").content(json.createObjectNode().put("segment", "sports")
                .toString()).principal(() -> actor.toString())).andExpect(status().isBadRequest());
        correct.perform(put(path).contentType("application/json").content(body.toString()).principal(() -> actor.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.segment").value("sports"))
                .andExpect(jsonPath("$.data.primaryGenre").value("football"))
                .andExpect(jsonPath("$.data.genres[0]").value("esports"));
        assertThat(cv(event.id())).isEqualTo(version + 1);
        assertThat(publications(performance)).isEqualTo(2);
        assertThat(latestPayload(performance).path("segment").asText()).isEqualTo("sports");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM organizer_audit_log WHERE subject_id=? AND action=?",
                Integer.class, event.id(), "EVENT_CLASSIFICATION_CORRECTED")).isEqualTo(1);
        correct.perform(put("/api/admin/events/" + UUID.randomUUID() + "/classification")
                .contentType("application/json").content(body.toString()).principal(() -> actor.toString()))
                .andExpect(status().isNotFound());

        // Legacy-linked events are corrected too, without a snapshot re-issue.
        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,organization_id,title,venue_name,venue_address,event_date,sale_start_at,status,created_by)
                VALUES (?,?,'Legacy corrected','Hall','Street',?,?,'DRAFT',?)
                """, legacy, owner, OffsetDateTime.now(ZoneOffset.UTC).plusDays(5), OffsetDateTime.now(ZoneOffset.UTC), actor);
        var legacyBody = json.createObjectNode().put("segment", "family").put("primaryGenre", "kids-show")
                .put("expectedContentVersion", cv(legacy));
        correct.perform(put("/api/admin/events/" + legacy + "/classification").contentType("application/json")
                .content(legacyBody.toString()).principal(() -> actor.toString())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.primaryGenre").value("kids-show"));
        assertThat(jdbc.queryForObject("SELECT segment_id FROM events WHERE id=?", String.class, legacy)).isEqualTo("family");
    }

    @Test
    void unclassifiedEventsCannotBeSubmittedButClassifiedOnesCan() {
        var bare = tx(() -> content.create(owner, new Input("Bare show", null, null, null, null, null, Map.of(), null, null,
                null)));
        assertThatThrownBy(() -> submitted(bare.id(), 20)).hasMessage("error.performance.classification-missing");
        var segmentOnly = tx(() -> content.updateDraft(owner, bare.id(), bare.contentVersion(), new Input("Bare show", null,
                null, "sports", null, null, Map.of(), null, null, null)));
        assertThatThrownBy(() -> submitted(segmentOnly.id(), 21)).hasMessage("error.performance.classification-missing");
        tx(() -> content.updateDraft(owner, bare.id(), segmentOnly.contentVersion(), new Input("Bare show", null, null,
                "sports", "football", null, Map.of(), null, null, null)));
        submitted(bare.id(), 22);
    }

    @Test
    void aScheduledReleaseAcceptsTheReviewedVersionEvenWhenTheGenreWasLaterRemoved() {
        var event = tx(() -> content.create(owner, input("Scheduled show", "x")));
        var performance = submitted(event.id(), 20);
        var review = reviews.current(performance).id();
        // A segment without a genre cannot be submitted, but approval and release take the reviewed version as it is.
        jdbc.update("UPDATE events SET primary_genre_id=NULL WHERE id=?", event.id());
        tx(() -> reviews.decide(performance, review, UUID.randomUUID(), PerformancePublicationReview.Action.APPROVE, null));
        jdbc.update("UPDATE performance_publication_reviews SET publish_at=clock_timestamp()-interval '1 second' WHERE id=?",
                review);
        tx(() -> { reviews.release(performance); return null; });
        assertThat(jdbc.queryForObject("SELECT status FROM performances WHERE id=?", String.class, performance))
                .isEqualTo("ON_SALE");
    }

    @Test
    void adminCorrectionIsRefusedWhileARevisionIsInReviewAndAReleasedEventKeepsItsPrimaryGenre() throws Exception {
        var event = tx(() -> content.create(owner, input("Review lock show", "x")));
        released(event.id(), 12);
        // A revision cannot drop the primary genre of a released event.
        assertThatThrownBy(() -> tx(() -> content.stage(owner, event.id(), 0L, new Input("Review lock show", "x", null,
                "concerts", null, null, Map.of(), null, null, null)))).hasMessage("error.classification.primary-genre-required");
        tx(() -> content.stage(owner, event.id(), 0L, new Input("Review lock show", "edited", null, null, null, null,
                Map.of(), null, null, null)));
        tx(() -> content.submit(owner, actor, event.id(), 1L));
        var path = "/api/admin/events/" + event.id() + "/classification";
        var body = json.createObjectNode().put("segment", "sports").put("primaryGenre", "football")
                .put("expectedContentVersion", cv(event.id()));
        correct.perform(put(path).contentType("application/json").content(body.toString()).principal(() -> actor.toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("error.classification.revision-in-review"));
        assertThat(jdbc.queryForObject("SELECT segment_id FROM events WHERE id=?", String.class, event.id()))
                .isEqualTo("concerts");
        tx(() -> content.withdraw(owner, event.id()));
        var noGenre = json.createObjectNode().put("segment", "sports").put("expectedContentVersion", cv(event.id()));
        correct.perform(put(path).contentType("application/json").content(noGenre.toString()).principal(() -> actor.toString()))
                .andExpect(status().isBadRequest());
        body.put("expectedContentVersion", cv(event.id()));
        correct.perform(put(path).contentType("application/json").content(body.toString()).principal(() -> actor.toString()))
                .andExpect(status().isOk());
    }

    @Test
    void theAdminClassificationEndpointRefusesCallersWithoutPlatformAccess() throws Exception {
        var rest = org.springframework.web.client.RestClient.builder();
        var server = org.springframework.test.web.client.MockRestServiceServer.bindTo(rest).build();
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers
                        .requestTo("http://identity/internal/split/v1/platform-access"))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators
                        .withStatus(org.springframework.http.HttpStatus.FORBIDDEN));
        var guarded = MockMvcBuilders.standaloneSetup(
                        new org.ticketbox.catalog.performance.web.AdminEventClassificationController(content))
                .addMappedInterceptors(new String[] {"/api/admin/**"}, new OrganizationAccess(rest.build(), "http://identity"))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        var event = tx(() -> content.create(owner, input("Guarded show", "x")));
        var body = json.createObjectNode().put("segment", "sports").put("primaryGenre", "football")
                .put("expectedContentVersion", cv(event.id()));
        guarded.perform(put("/api/admin/events/" + event.id() + "/classification").contentType("application/json")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer buyer").content(body.toString())
                        .principal(() -> owner.toString()))
                .andExpect(status().isForbidden());
        server.verify();
        assertThat(jdbc.queryForObject("SELECT segment_id FROM events WHERE id=?", String.class, event.id()))
                .isEqualTo("concerts");
    }

    @Test
    void draftEventsCreatedThroughTheCatalogAreCheckedAgainstTheReferenceData() {
        assertThatThrownBy(() -> tx(() -> catalog.createEvent(owner, "Mismatch", null,
                new EventClassification("sports", "vpop", List.of())))).isInstanceOf(DomainViolation.class)
                .hasMessage("error.classification.genre-outside-segment");
        var event = tx(() -> catalog.createEvent(owner, "Checked", null, new EventClassification("sports", "football", List.of())));
        assertThatThrownBy(() -> tx(() -> catalog.updateDraftEvent(owner, event.id(), event.draftVersion(), "Checked", null,
                new EventClassification("opera", null, List.of())))).isInstanceOf(DomainViolation.class)
                .hasMessage("error.classification.unknown-segment");
    }

    private PerformanceViews.Performance readyDraft(UUID event, int days) {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(days).withNano(0);
        var draft = tx(() -> catalog.createPerformance(owner, event, new PerformanceCatalog.Schedule(space, starts,
                starts.plusHours(2), starts.minusHours(1), "Asia/Ho_Chi_Minh", starts.minusDays(2),
                starts.minusHours(2), 4, true)));
        var group = new org.ticketbox.catalog.performance.domain.PerformanceSale.Group(UUID.randomUUID(), null, "Floor",
                org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind.GA, 50, List.of());
        var offer = new org.ticketbox.catalog.performance.domain.PerformanceSale.Offer(UUID.randomUUID(), group.id(),
                "Standard", java.math.BigDecimal.valueOf(100_000), "VND", starts.minusDays(2), starts.minusHours(2), true);
        tx(() -> catalog.saveSale(owner, actor, draft.id(), 0,
                new org.ticketbox.catalog.performance.domain.PerformanceSale(List.of(group), List.of(offer))));
        return draft;
    }

    private UUID published(UUID event, int days) {
        var draft = readyDraft(event, days);
        tx(() -> catalog.publish(owner, actor, draft.id(), 1L, null, null, null));
        return draft.id();
    }

    /** Submits a performance of the event for release review, as an organizer does. */
    private UUID submitted(UUID event, int days) {
        var draft = readyDraft(event, days);
        var versions = new org.ticketbox.catalog.performance.application.PerformanceReviewStore.Versions(
                1, 0, catalog.event(event, owner).draftVersion(), draft.draftVersion());
        tx(() -> reviews.submit(owner, actor, draft.id(), versions, OffsetDateTime.now(ZoneOffset.UTC).plusHours(1)));
        return draft.id();
    }

    private int publications(UUID performance) {
        return jdbc.queryForObject("SELECT count(*) FROM performance_sale_publications WHERE performance_id=?",
                Integer.class, performance);
    }

    private com.fasterxml.jackson.databind.JsonNode latestPayload(UUID performance) {
        try {
            return json.readTree(jdbc.queryForObject("""
                    SELECT payload FROM performance_sale_publications WHERE performance_id=? ORDER BY version DESC LIMIT 1
                    """, String.class, performance));
        } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
            throw new AssertionError(failure);
        }
    }

    @Test
    void legacyEventsKeepConcertContentAndAnEventPosterWinsWhenSet() throws Exception {
        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,organization_id,title,venue_name,venue_address,event_date,sale_start_at,status,
                    poster_url,artist_bio,created_by,localized_content)
                VALUES (?,?,'Legacy show','Hall','Main Street',?,?, 'ON_SALE','https://cdn.test/legacy.png','Legacy bio',?,
                    '{"original":{"title":"Legacy show"},"translations":{"vi":{"title":"Buổi cũ"}}}')
                """, legacy, owner, OffsetDateTime.now(ZoneOffset.UTC).plusDays(30),
                OffsetDateTime.now(ZoneOffset.UTC).minusDays(1), actor);
        buyer.perform(get("/api/v2/events/" + legacy)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.posterUrl").value("https://cdn.test/legacy.png"))
                .andExpect(jsonPath("$.data.artistBio").value("Legacy bio"))
                .andExpect(jsonPath("$.data.translations.vi.title").value("Buổi cũ"));
        jdbc.update("UPDATE events SET poster_url='https://cdn.test/event.png' WHERE id=?", legacy);
        buyer.perform(get("/api/v2/events/" + legacy))
                .andExpect(jsonPath("$.data.posterUrl").value("https://cdn.test/event.png"))
                .andExpect(jsonPath("$.data.artistBio").value("Legacy bio"));
    }

    @Test
    void failedUploadsRollbackAndOtherOrganizationsCannotChangeThePoster() {
        var event = tx(() -> content.create(owner, input("Poster show", null)));
        var first = tx(() -> content.replacePoster(owner, event.id(), cv(event.id()), null, upload())).event();
        assertThat(first.posterUrl()).isNotNull();

        posters.fail = true;
        assertThatThrownBy(() -> tx(() -> content.replacePoster(owner, event.id(), cv(event.id()), null, upload())))
                .isInstanceOf(AppException.class).hasMessage("error.poster.upload-failed");
        posters.fail = false;
        assertThat(tx(() -> content.state(owner, event.id())).event().posterUrl()).isEqualTo(first.posterUrl());

        int uploads = posters.uploaded.size();
        assertThatThrownBy(() -> tx(() -> content.replacePoster(owner, event.id(), 999L, null, upload())))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");
        assertThat(posters.deleted).contains(posters.uploaded.get(uploads));
        assertThat(tx(() -> content.state(owner, event.id())).event().posterUrl()).isEqualTo(first.posterUrl());

        assertThatThrownBy(() -> tx(() -> content.replacePoster(other, event.id(), cv(event.id()), null, upload())))
                .isInstanceOf(AppException.class).hasMessage("error.performance.not-found");

        var removed = tx(() -> content.removePoster(owner, event.id(), cv(event.id()), null)).event();
        assertThat(removed.posterUrl()).isNull();
        assertThat(posters.deleted).contains(posters.uploaded.get(0));
    }

    @Test
    void releasedEventsStageContentUntilAReviewerApproves() {
        var event = tx(() -> content.create(owner, input("Reviewed show", "Old description")));
        released(event.id(), 10);
        assertThatThrownBy(() -> tx(() -> content.updateDraft(owner, event.id(), event.contentVersion(),
                input("Reviewed show", "Direct edit")))).hasMessage("error.performance.event-draft-locked");

        var staged = tx(() -> content.stage(owner, event.id(), 0L, input("Reviewed show", "New description")));
        assertThat(staged.revision().state()).isEqualTo(State.DRAFTING);
        assertThat(staged.revision().revision()).isEqualTo(1);
        assertThat(store.event(event.id(), null).orElseThrow().description()).isEqualTo("Old description");

        // A second editor with a stale revision gets a conflict.
        assertThatThrownBy(() -> tx(() -> content.stage(owner, event.id(), 0L, input("Reviewed show", "Other"))))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");
        var submitted = tx(() -> content.submit(owner, actor, event.id(), 1L));
        assertThat(submitted.revision().state()).isEqualTo(State.SUBMITTED);
        assertThatThrownBy(() -> tx(() -> content.stage(owner, event.id(), 1L, input("Reviewed show", "Late"))))
                .hasMessage("error.event-content.revision-in-review");
        assertThat(store.event(event.id(), null).orElseThrow().description()).isEqualTo("Old description");
        assertThat(tx(() -> content.queue(State.SUBMITTED, PageRequest.of(0, 50))).getContent())
                .anyMatch(row -> row.eventId().equals(event.id()));

        UUID reviewer = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 7)))
                .isInstanceOf(DomainViolation.class).hasMessage("error.performance.version-conflict");
        assertThat(store.event(event.id(), null).orElseThrow().description()).isEqualTo("Old description");

        var approved = tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 1));
        assertThat(approved.revision().state()).isEqualTo(State.APPROVED);
        var live = store.event(event.id(), null).orElseThrow();
        assertThat(live.description()).isEqualTo("New description");
        assertThat(live.contentVersion()).isGreaterThan(event.contentVersion());
        assertThat(live.draftVersion()).isEqualTo(event.draftVersion());
        assertThat(jdbc.queryForObject("SELECT reviewer_id FROM event_content_revisions WHERE event_id=?", UUID.class,
                event.id())).isEqualTo(reviewer);

        // Repeating the completed decision returns the recorded outcome without another change.
        var again = tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 1));
        assertThat(again.revision().state()).isEqualTo(State.APPROVED);
        assertThat(store.event(event.id(), null).orElseThrow().contentVersion()).isEqualTo(live.contentVersion());
        assertThatThrownBy(() -> tx(() -> content.decide(reviewer, event.id(), Action.REJECT, "no", 1)))
                .isInstanceOf(DomainViolation.class).hasMessage("error.event-content.revision-not-submitted");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM organizer_audit_log WHERE subject_id=?", Integer.class,
                event.id())).isEqualTo(2);
    }

    @Test
    void changesRequestedAndRejectedKeepLiveContentAndAllowAnotherRevision() {
        var event = tx(() -> content.create(owner, input("Decision show", "Live")));
        released(event.id(), 10);
        tx(() -> content.stage(owner, event.id(), 0L, input("Decision show", "Proposed")));
        tx(() -> content.submit(owner, actor, event.id(), 1L));
        UUID reviewer = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> content.decide(reviewer, event.id(), Action.REQUEST_CHANGES, " ", 1)))
                .hasMessage("error.event-content.reason-required");
        var changes = tx(() -> content.decide(reviewer, event.id(), Action.REQUEST_CHANGES, "Add the venue name", 1));
        assertThat(changes.revision().state()).isEqualTo(State.CHANGES_REQUESTED);
        assertThat(changes.revision().reason()).isEqualTo("Add the venue name");
        assertThat(tx(() -> content.state(owner, event.id())).revision().reason()).isEqualTo("Add the venue name");
        assertThat(store.event(event.id(), null).orElseThrow().description()).isEqualTo("Live");

        var edited = tx(() -> content.stage(owner, event.id(), 1L, input("Decision show", "Proposed again")));
        assertThat(edited.revision().revision()).isEqualTo(2);
        assertThat(edited.revision().state()).isEqualTo(State.DRAFTING);
        tx(() -> content.submit(owner, actor, event.id(), 2L));
        var rejected = tx(() -> content.decide(reviewer, event.id(), Action.REJECT, "Not appropriate", 2));
        assertThat(rejected.revision().state()).isEqualTo(State.REJECTED);
        assertThat(store.event(event.id(), null).orElseThrow().description()).isEqualTo("Live");

        var discarded = tx(() -> content.discard(owner, event.id()));
        assertThat(discarded.revision()).isNull();
    }

    @Test
    void aPendingRevisionDoesNotBlockAnotherPerformanceRelease() {
        var event = tx(() -> content.create(owner, input("Overlap show", "Live")));
        released(event.id(), 10);
        tx(() -> content.stage(owner, event.id(), 0L, input("Overlap show", "Proposed")));
        tx(() -> content.submit(owner, actor, event.id(), 1L));
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(20).withNano(0);
        var draft = tx(() -> catalog.createPerformance(owner, event.id(), new PerformanceCatalog.Schedule(space, starts,
                starts.plusHours(2), starts.minusHours(1), "Asia/Ho_Chi_Minh", starts.minusDays(2),
                starts.minusHours(2), 4, true)));
        var group = new org.ticketbox.catalog.performance.domain.PerformanceSale.Group(UUID.randomUUID(), null, "Floor",
                org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind.GA, 50, List.of());
        var offer = new org.ticketbox.catalog.performance.domain.PerformanceSale.Offer(UUID.randomUUID(), group.id(),
                "Standard", java.math.BigDecimal.valueOf(100_000), "VND", starts.minusDays(2), starts.minusHours(2), true, null, null);
        tx(() -> catalog.saveSale(owner, actor, draft.id(), 0,
                new org.ticketbox.catalog.performance.domain.PerformanceSale(List.of(group), List.of(offer))));
        var result = tx(() -> catalog.publish(owner, actor, draft.id(), 1L, null, null, null));
        assertThat(result.status()).isEqualTo("ON_SALE");
        assertThat(tx(() -> content.state(owner, event.id())).revision().state()).isEqualTo(State.SUBMITTED);
    }

    @Test
    void previewShowsDraftsAndTheStagedRevisionOnlyToTheOwnerOrThePlatform() throws Exception {
        var event = tx(() -> content.create(owner, input("Preview show", "Live")));
        UUID draft = draft(event.id(), 12);
        var path = ORGANIZER + "/events/" + event.id() + "/preview";
        var response = organizer.perform(get(path).requestAttr(OrganizationAccess.ORGANIZATION, owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.performances[0].id").value(draft.toString()))
                .andExpect(jsonPath("$.data.description").value("Live")).andReturn().getResponse();
        assertThat(response.getHeader(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-store");
        organizer.perform(get(path).requestAttr(OrganizationAccess.ORGANIZATION, other)).andExpect(status().isNotFound());
        buyer.perform(get("/api/v2/events/" + event.id())).andExpect(status().isNotFound());
        admin.perform(get("/api/admin/v2/events/" + event.id() + "/preview")).andExpect(status().isOk());

        released(event.id(), 14);
        tx(() -> content.stage(owner, event.id(), 0L, input("Preview show", "Staged text")));
        organizer.perform(get(path).param("revision", "true").requestAttr(OrganizationAccess.ORGANIZATION, owner))
                .andExpect(jsonPath("$.data.description").value("Staged text"));
        organizer.perform(get(path).requestAttr(OrganizationAccess.ORGANIZATION, owner))
                .andExpect(jsonPath("$.data.description").value("Live"));
        buyer.perform(get("/api/v2/events/" + event.id())).andExpect(jsonPath("$.data.description").value("Live"));
    }

    @Test
    void draftsAreDeletedWithAVersionCheckAndSharedBackgroundsSurvive() {
        var event = tx(() -> content.create(owner, input("Deletable show", "x")));
        UUID first = draft(event.id(), 12);
        UUID second = draft(event.id(), 13);
        UUID background = UUID.randomUUID();
        jdbc.update("INSERT INTO layout_backgrounds(id,organization_id,source_performance_id,content_type,content) VALUES (?,?,?,'image/png',?)",
                background, owner, first, new byte[] {1});
        UUID shared = UUID.randomUUID();
        jdbc.update("INSERT INTO layout_backgrounds(id,organization_id,source_performance_id,content_type,content) VALUES (?,?,?,'image/png',?)",
                shared, owner, first, new byte[] {2});
        UUID template = UUID.randomUUID();
        jdbc.update("INSERT INTO layout_templates(id,organization_id,venue_space_id,name,version) VALUES (?,?,?,'Template',1)",
                template, owner, space);
        jdbc.update("INSERT INTO layout_revisions(template_id,version,document) VALUES (?,1,CAST(? AS jsonb))",
                template, "{\"backgroundUrl\":\"/api/organizer/layout/background/" + shared + "\"}");
        long version = jdbc.queryForObject("SELECT draft_version FROM performances WHERE id=?", Long.class, first);

        assertThatThrownBy(() -> run(() -> drafts.deletePerformance(owner, actor, first, version + 3)))
                .hasMessage("error.performance.version-conflict");
        assertThatThrownBy(() -> run(() -> drafts.deletePerformance(other, actor, first, version)))
                .hasMessage("error.performance.not-found");
        tx(() -> {
            drafts.deletePerformance(owner, actor, first, version);
            return null;
        });
        assertThat(count("performances", first)).isZero();
        assertThat(count("events", event.id())).isEqualTo(1);
        // The unreferenced background goes with its performance; the one a template still uses stays.
        assertThat(count("layout_backgrounds", background)).isZero();
        assertThat(jdbc.queryForObject("SELECT source_performance_id FROM layout_backgrounds WHERE id=?", UUID.class,
                shared)).isNull();

        // A submitted review blocks deletion, then a rejected one does not.
        UUID review = reviewFor(second, "SUBMITTED");
        long secondVersion = jdbc.queryForObject("SELECT draft_version FROM performances WHERE id=?", Long.class, second);
        assertThatThrownBy(() -> run(() -> drafts.deletePerformance(owner, actor, second, secondVersion)))
                .hasMessage("error.performance.not-deletable");
        assertThatThrownBy(() -> run(() -> drafts.deleteEvent(owner, actor, event.id(), 99L)))
                .hasMessage("error.performance.version-conflict");
        jdbc.update("UPDATE performance_publication_reviews SET state='SCHEDULED' WHERE id=?", review);
        assertThatThrownBy(() -> run(() -> drafts.deletePerformance(owner, actor, second, secondVersion)))
                .hasMessage("error.performance.not-deletable");
        jdbc.update("UPDATE performance_publication_reviews SET state='REJECTED' WHERE id=?", review);

        var poster = tx(() -> content.replacePoster(owner, event.id(), cv(event.id()), null, upload())).event();
        long eventVersion = poster.draftVersion();
        tx(() -> {
            drafts.deleteEvent(owner, actor, event.id(), eventVersion);
            return null;
        });
        assertThat(count("events", event.id())).isZero();
        assertThat(count("performances", second)).isZero();
        assertThat(posters.deleted).hasSize(1);
    }

    @Test
    void releasedAndOtherOrganizationsEventsCannotBeDeleted() {
        var event = tx(() -> content.create(owner, input("Protected show", "x")));
        draft(event.id(), 12);
        released(event.id(), 14);
        long version = store.event(event.id(), owner).orElseThrow().draftVersion();
        assertThatThrownBy(() -> run(() -> drafts.deleteEvent(owner, actor, event.id(), version)))
                .hasMessage("error.performance.not-deletable");
        assertThat(count("events", event.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performances WHERE event_id=?", Integer.class, event.id()))
                .isEqualTo(2);
        assertThatThrownBy(() -> run(() -> drafts.deleteEvent(other, actor, event.id(), version)))
                .hasMessage("error.performance.not-found");

        UUID releasedShow = jdbc.queryForObject(
                "SELECT id FROM performances WHERE event_id=? AND status='ON_SALE'", UUID.class, event.id());
        long showVersion = jdbc.queryForObject("SELECT draft_version FROM performances WHERE id=?", Long.class, releasedShow);
        assertThatThrownBy(() -> run(() -> drafts.deletePerformance(owner, actor, releasedShow, showVersion)))
                .hasMessage("error.performance.not-deletable");

        UUID legacy = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO concerts(id,organization_id,title,venue_name,venue_address,event_date,sale_start_at,status,created_by)
                VALUES (?,?,'Legacy','Hall','Street',?,?,'DRAFT',?)
                """, legacy, owner, OffsetDateTime.now(ZoneOffset.UTC).plusDays(5),
                OffsetDateTime.now(ZoneOffset.UTC), actor);
        assertThatThrownBy(() -> run(() -> drafts.deleteEvent(owner, actor, legacy, 0L)))
                .hasMessage("error.performance.not-found");
        assertThatThrownBy(() -> run(() -> drafts.deletePerformance(owner, actor, legacy, 0L)))
                .hasMessage("error.performance.not-found");
    }

    @Test
    void aSecondRevisionCanBeStagedAndSubmittedAfterTheFirstWasApproved() {
        var event = tx(() -> content.create(owner, input("Twice show", "v0")));
        released(event.id(), 10);
        UUID reviewer = UUID.randomUUID();
        tx(() -> content.stage(owner, event.id(), 0L, input("Twice show", "v1")));
        tx(() -> content.submit(owner, actor, event.id(), 1L));
        tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 1));

        // The server revision stays 1 after approval, so the editor sends it back unchanged.
        var staged = tx(() -> content.stage(owner, event.id(), 1L, input("Twice show", "v2")));
        assertThat(staged.revision().revision()).isEqualTo(2);
        assertThat(staged.revision().state()).isEqualTo(State.DRAFTING);
        var poster = tx(() -> content.replacePoster(owner, event.id(), null, 2L, upload()));
        assertThat(poster.revision().revision()).isEqualTo(3);
        assertThat(poster.revision().posterChanged()).isTrue();
        assertThatThrownBy(() -> tx(() -> content.stage(owner, event.id(), 0L, input("Twice show", "stale"))))
                .hasMessage("error.performance.version-conflict");
        assertThat(tx(() -> content.submit(owner, actor, event.id(), 3L)).revision().state()).isEqualTo(State.SUBMITTED);
        tx(() -> content.decide(reviewer, event.id(), Action.APPROVE, null, 3));
        assertThat(store.event(event.id(), null).orElseThrow().description()).isEqualTo("v2");
    }

    @Test
    void draftPosterChangesRequireTheContentVersionAndEveryPreReleaseContentWriteBumpsTheDraftVersion() {
        var event = tx(() -> content.create(owner, input("Versioned show", "x")));
        assertThatThrownBy(() -> tx(() -> content.replacePoster(owner, event.id(), null, null, upload())))
                .hasMessage("error.performance.expected-draft-version");
        assertThatThrownBy(() -> tx(() -> content.removePoster(owner, event.id(), null, null)))
                .hasMessage("error.performance.expected-draft-version");
        long drafts = event.draftVersion();
        var posted = tx(() -> content.replacePoster(owner, event.id(), event.contentVersion(), null, upload())).event();
        var edited = tx(() -> content.updateDraft(owner, event.id(), posted.contentVersion(),
                new Input("Versioned show", "x", "concerts", Map.of(), "New bio", "ALL", null)));
        assertThat(edited.contentVersion()).isEqualTo(event.contentVersion() + 2);
        assertThat(posted.draftVersion()).isEqualTo(drafts + 1);
        assertThat(edited.draftVersion()).isEqualTo(drafts + 2);
        var renamed = tx(() -> content.updateDraft(owner, event.id(), edited.contentVersion(),
                new Input("Renamed show", "x", "concerts", Map.of(), "New bio", "ALL", null)));
        assertThat(renamed.draftVersion()).isEqualTo(drafts + 3);
    }

    @Test
    void directoryRollsPerformanceStatusesUpByPriority() {
        UUID org = UUID.randomUUID();
        UUID venue = UUID.randomUUID();
        UUID room = UUID.randomUUID();
        jdbc.update("INSERT INTO venues(id,organization_id,name,address) VALUES (?,?,'Hall','Road')", venue, org);
        jdbc.update("INSERT INTO venue_spaces(id,venue_id,name) VALUES (?,?,'Room')", room, venue);
        UUID none = eventOf(org, "Dir none");
        UUID draftEvent = eventOf(org, "Dir draft");
        shows(draftEvent, room, "DRAFT", 10);
        UUID review = eventOf(org, "Dir review");
        reviewFor(shows(review, room, "DRAFT", 10), "SUBMITTED");
        UUID changes = eventOf(org, "Dir changes");
        reviewFor(shows(changes, room, "DRAFT", 10), "CHANGES_REQUESTED");
        UUID scheduled = eventOf(org, "Dir scheduled");
        reviewFor(shows(scheduled, room, "DRAFT", 10), "SCHEDULED");
        UUID rejected = eventOf(org, "Dir rejected");
        reviewFor(shows(rejected, room, "DRAFT", 10), "REJECTED");
        UUID onSale = eventOf(org, "Dir on sale");
        shows(onSale, room, "ON_SALE", 10);
        UUID soldOut = eventOf(org, "Dir sold out");
        shows(soldOut, room, "SOLD_OUT", 10);
        UUID past = eventOf(org, "Dir past");
        shows(past, room, "ON_SALE", -10);
        UUID completed = eventOf(org, "Dir completed");
        shows(completed, room, "COMPLETED", 10);
        UUID cancelled = eventOf(org, "Dir cancelled");
        shows(cancelled, room, "CANCELLED", 10);
        UUID mixed = eventOf(org, "Dir mixed");
        shows(mixed, room, "DRAFT", 11);
        shows(mixed, room, "ON_SALE", 12);
        shows(mixed, room, "CANCELLED", 13);
        UUID urgent = eventOf(org, "Dir urgent");
        shows(urgent, room, "ON_SALE", 11);
        reviewFor(shows(urgent, room, "DRAFT", 12), "CHANGES_REQUESTED");
        jdbc.update("UPDATE events SET poster_url='https://cdn.test/dir.png' WHERE id=?", onSale);
        jdbc.update("""
                INSERT INTO event_content_revisions(event_id,revision,base_content_version,details,state)
                VALUES (?,1,0,'{}','SUBMITTED')
                """, onSale);

        assertThat(ids(org, EventStatus.DRAFT)).containsExactlyInAnyOrder(none, draftEvent, rejected, mixed);
        assertThat(ids(org, EventStatus.IN_REVIEW)).containsExactly(review);
        assertThat(ids(org, EventStatus.CHANGES_REQUESTED)).containsExactlyInAnyOrder(changes, urgent);
        assertThat(ids(org, EventStatus.SCHEDULED)).containsExactly(scheduled);
        assertThat(ids(org, EventStatus.ON_SALE)).containsExactlyInAnyOrder(onSale, mixed, urgent);
        assertThat(ids(org, EventStatus.SOLD_OUT)).containsExactly(soldOut);
        assertThat(ids(org, EventStatus.PAST)).containsExactlyInAnyOrder(past, completed);
        assertThat(ids(org, EventStatus.CANCELLED)).containsExactlyInAnyOrder(cancelled, mixed);
        assertThat(ids(org, EventStatus.PREPARING)).containsExactlyInAnyOrder(
                none, draftEvent, review, changes, rejected, mixed, urgent);

        var rows = operations.events(org, new EventFilters(null, null, null), PageRequest.of(0, 50)).getContent();
        assertThat(statusOf(rows, mixed)).isEqualTo("ON_SALE");
        assertThat(statusOf(rows, urgent)).isEqualTo("CHANGES_REQUESTED");
        assertThat(statusOf(rows, none)).isEqualTo("DRAFT");
        assertThat(statusOf(rows, past)).isEqualTo("PAST");
        var row = rows.stream().filter(value -> value.id().equals(onSale)).findFirst().orElseThrow();
        assertThat(row.posterUrl()).isEqualTo("https://cdn.test/dir.png");
        assertThat(row.contentChangeInReview()).isTrue();
        assertThat(row.performanceCount()).isEqualTo(1);
        assertThat(row.preparing()).isFalse();
        assertThat(rows.stream().filter(value -> value.id().equals(review)).findFirst().orElseThrow().preparing()).isTrue();
        assertThat(rows.stream().filter(value -> value.id().equals(scheduled)).findFirst().orElseThrow().preparing()).isFalse();
        assertThat(row.nextStartsAt()).isNotNull();
    }

    private String statusOf(List<org.ticketbox.catalog.performance.application.WorkspaceOperationsStore.EventRow> rows, UUID id) {
        return rows.stream().filter(value -> value.id().equals(id)).findFirst().orElseThrow().status();
    }

    private List<UUID> ids(UUID organization, EventStatus status) {
        return operations.events(organization, new EventFilters(null, status, null), PageRequest.of(0, 50)).getContent().stream()
                .map(org.ticketbox.catalog.performance.application.WorkspaceOperationsStore.EventRow::id).toList();
    }

    private UUID eventOf(UUID org, String title) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO events(id,organization_id,title) VALUES (?,?,?)", id, org, title);
        return id;
    }

    /** Inserts a performance in the given status, `days` from now. */
    private UUID shows(UUID event, UUID room, String state, int days) {
        UUID id = UUID.randomUUID();
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(days).withNano(0);
        boolean released = !"DRAFT".equals(state);
        jdbc.update("""
                INSERT INTO performances(id,event_id,venue_space_id,starts_at,ends_at,timezone,sale_start_at,sale_end_at,
                    status,public_visible,sale_version) VALUES (?,?,?,?,?,'Asia/Ho_Chi_Minh',?,?,?,true,?)
                """, id, event, room, starts, starts.plusHours(2), starts.minusDays(30), starts.minusHours(1), state,
                released ? 1 : 0);
        if (released) {
            jdbc.update("INSERT INTO performance_sale_publications(performance_id,version,payload,actor_id,ticketing_ack) VALUES (?,1,'{}',?,true)",
                    id, actor);
        }
        return id;
    }

    private UUID reviewFor(UUID performance, String state) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO performance_publication_reviews(id,performance_id,submitted_by,publish_at,sale_version,
                    layout_version,event_draft_version,schedule_draft_version,summary,state)
                VALUES (?,?,?,now() + interval '1 day',0,0,0,0,'{}',?)
                """, id, performance, actor, state);
        return id;
    }

    private UUID released(UUID event, int days) {
        return shows(event, space, "ON_SALE", days);
    }

    private UUID draft(UUID event, int days) {
        return shows(event, space, "DRAFT", days);
    }

    private long cv(UUID event) {
        return jdbc.queryForObject("SELECT content_version FROM events WHERE id=?", Long.class, event);
    }

    private int count(String table, UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE id=?", Integer.class, id);
    }

    private static Upload upload() {
        return new TestUpload("file", "poster.png", "image/png", new byte[] {1});
    }

    private static void run(Runnable action) {
        transaction.executeWithoutResult(status -> action.run());
    }

    private static <T> T tx(Supplier<T> action) {
        return transaction.execute(status -> action.get());
    }

    /** Stores posters in memory and records what was deleted. */
    static final class FakePosters implements PosterStorage {
        final List<String> uploaded = new ArrayList<>();
        final List<String> deleted = new ArrayList<>();
        boolean fail;

        @Override
        public StoredPoster upload(UUID concertId, Upload file) {
            throw new UnsupportedOperationException();
        }

        @Override
        public StoredPoster uploadEventPoster(UUID eventId, Upload file) {
            if (fail) throw new AppException(org.ticketbox.catalog.application.error.ErrorCode.IMAGE_STORAGE_UNAVAILABLE,
                    "error.poster.upload-failed");
            String id = "event-" + eventId + "-" + (uploaded.size() + 1);
            uploaded.add(id);
            return new StoredPoster("https://cdn.test/" + uploaded.size(), id);
        }

        @Override
        public void deleteBestEffort(String publicId) {
            deleted.add(publicId);
        }
    }

}
