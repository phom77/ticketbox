package org.ticketbox.catalog.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.classification.application.ClassificationQuery;
import org.ticketbox.catalog.classification.domain.EventClassification;
import org.ticketbox.catalog.classification.infrastructure.JdbcClassificationStore;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore;
import org.ticketbox.catalog.performance.application.PerformanceCatalog;
import org.ticketbox.catalog.performance.application.PerformanceDisruptionRequests;
import org.ticketbox.catalog.performance.application.PerformanceDisruptions;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview.Action;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview.ReleaseMode;
import org.ticketbox.catalog.performance.application.PerformanceReviewStore.Versions;
import org.ticketbox.catalog.performance.application.PerformanceSalesControls;
import org.ticketbox.catalog.performance.application.PerformanceScheduling;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.application.VenueLibrary;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Kind;
import org.ticketbox.catalog.performance.domain.PerformanceLayout.Point;
import org.ticketbox.catalog.performance.domain.PerformanceSale;
import org.ticketbox.catalog.performance.infrastructure.JdbcEventContentStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceDisruptions;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceReviewStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcPerformanceStore;
import org.ticketbox.catalog.performance.infrastructure.JdbcSalesControlStore;
import org.ticketbox.catalog.performance.web.OrganizerSalesController;
import org.ticketbox.catalog.performance.web.OrganizerSchedulingController;
import org.ticketbox.catalog.performance.web.PerformanceDisruptionRequestController;
import org.ticketbox.catalog.web.GlobalExceptionHandler;
import org.ticketbox.catalog.web.security.OrganizationAccess;
import org.ticketbox.catalog.web.security.OrganizerPermission;

@Testcontainers
class GuidedSchedulingIntegrationTest {
    private static final EventClassification VPOP = new EventClassification("concerts", "vpop", List.of());
    private static final String ORGANIZER = "/api/organizer/manage/v2";
    private static final EventDisruptionStore.Kind CANCEL = EventDisruptionStore.Kind.CANCEL;
    private static final EventDisruptionStore.Kind POSTPONE = EventDisruptionStore.Kind.POSTPONE;

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static ObjectMapper json;
    private static JdbcPerformanceStore store;
    private static PerformanceCatalog catalog;
    private static PerformancePublicationReview reviews;
    private static PerformanceScheduling scheduling;
    private static VenueLibrary venues;
    private static PerformanceSalesControls sales;
    private static PerformanceDisruptionRequests requests;
    private static PerformanceDisruptions disruptions;
    private static MockMvc mvc;
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
        store = new JdbcPerformanceStore(jdbc, json);
        var classifications = new ClassificationQuery(new JdbcClassificationStore(jdbc));
        catalog = new PerformanceCatalog(store, classifications, "*");
        reviews = new PerformancePublicationReview(store, new JdbcPerformanceReviewStore(jdbc, json), catalog);
        var audit = new JdbcEventContentStore(jdbc, json);
        var controls = new JdbcSalesControlStore(jdbc);
        var disruptionStore = new JdbcPerformanceDisruptions(jdbc, json);
        scheduling = new PerformanceScheduling(store, audit);
        venues = new VenueLibrary(store);
        sales = new PerformanceSalesControls(store, controls, disruptionStore, audit);
        requests = new PerformanceDisruptionRequests(controls, sales, audit);
        disruptions = new PerformanceDisruptions(store, disruptionStore, null, controls);
        mvc = MockMvcBuilders.standaloneSetup(new OrganizerSchedulingController(scheduling, venues),
                        new OrganizerSalesController(sales, requests), new PerformanceDisruptionRequestController(requests))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(json)).build();
    }

    @BeforeEach
    void setUp() {
        acknowledgeEverything();
        owner = UUID.randomUUID();
        event = tx(() -> catalog.createEvent(owner, "Tour", "Dates", VPOP)).id();
        var created = tx(() -> catalog.createVenue(owner, "Room", "1 Street, Da Nang, Vietnam", "Stage", null, null, 800));
        venue = created.id();
        space = created.spaces().getFirst().id();
    }

    // ---- venue library ----

    @Test
    void newVenuesCarryTheCityTimeZoneAndCapacityHintAndDiscoveryUsesTheStoredCity() {
        var created = tx(() -> catalog.createVenue(owner, "Arena", "9 Road, Hue", "Main", "Hanoi", "Asia/Bangkok", 5000));
        assertThat(created.city()).isEqualTo("Hanoi");
        assertThat(created.timezone()).isEqualTo("Asia/Bangkok");
        assertThat(created.capacityHint()).isEqualTo(5000);
        assertThat(venue(venue).city()).isEqualTo("Da Nang");
        assertThat(venue(venue).timezone()).isEqualTo("Asia/Ho_Chi_Minh");
        assertThatThrownBy(() -> tx(() -> catalog.createVenue(owner, "Bad", "Addr", "S", null, "Mars/Base", null)))
                .isInstanceOf(AppException.class).hasMessage("error.performance.invalid-timezone");
        var released = released(10);
        assertThat(jdbc.queryForObject("SELECT payload->>'city' FROM performance_sale_publications WHERE performance_id=? AND version=?",
                String.class, released.id(), 2)).isEqualTo("Da Nang");
        tx(() -> venues.update(owner, venue, new VenueLibrary.Edit(0L, "Room", "1 Street, Da Nang, Vietnam", "Hoi An",
                null, 800)));
        assertThat(jdbc.queryForObject("SELECT venue_city FROM catalog_performance_view WHERE id=?", String.class,
                released.id())).isEqualTo("Hoi An");
    }

    @Test
    void venueNameAndAddressAreLockedWhileAReviewedPerformanceUsesTheVenue() {
        var draft = newPerformance(10);
        var renamed = tx(() -> venues.update(owner, venue, new VenueLibrary.Edit(0L, "Room 2", "2 Street, Hue", "Hue",
                "Asia/Ho_Chi_Minh", 900)));
        assertThat(renamed.name()).isEqualTo("Room 2");
        assertThat(renamed.version()).isEqualTo(1);
        submitForReview(draft, ReleaseMode.SCHEDULED, OffsetDateTime.now(ZoneOffset.UTC).plusHours(2));
        assertThatThrownBy(() -> tx(() -> venues.update(owner, venue,
                new VenueLibrary.Edit(1L, "Room 3", "2 Street, Hue", "Hue", "Asia/Ho_Chi_Minh", 900))))
                .isInstanceOf(AppException.class).hasMessage("error.venue.in-use")
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
        var details = tx(() -> venues.update(owner, venue, new VenueLibrary.Edit(1L, "Room 2", "2 Street, Hue",
                "Hue City", "Asia/Bangkok", 1200)));
        assertThat(details.city()).isEqualTo("Hue City");
        assertThat(details.capacityHint()).isEqualTo(1200);
        var added = tx(() -> venues.addSpace(owner, venue, "Hall B"));
        assertThat(added.spaces()).extracting("name").contains("Hall B");
        assertThatThrownBy(() -> tx(() -> venues.addSpace(owner, venue, "hall b")))
                .isInstanceOf(AppException.class).hasMessage("error.venue.duplicate-space");
        UUID hall = added.spaces().stream().filter(value -> value.name().equals("Hall B")).findFirst().orElseThrow().id();
        assertThatThrownBy(() -> tx(() -> venues.renameSpace(owner, venue, hall, "Hall C")))
                .isInstanceOf(AppException.class).hasMessage("error.venue.in-use");
    }

    @Test
    void releasedPerformancesLockVenueNamesAndAStaleEditorGetsAConflict() {
        released(10);
        assertThatThrownBy(() -> tx(() -> venues.update(owner, venue,
                new VenueLibrary.Edit(0L, "Renamed", "1 Street, Da Nang, Vietnam", "Da Nang", "Asia/Ho_Chi_Minh", 800))))
                .hasMessage("error.venue.in-use");
        tx(() -> venues.update(owner, venue, new VenueLibrary.Edit(0L, "Room", "1 Street, Da Nang, Vietnam", "Da Nang",
                "Asia/Ho_Chi_Minh", 700)));
        assertThatThrownBy(() -> tx(() -> venues.update(owner, venue,
                new VenueLibrary.Edit(0L, "Room", "1 Street, Da Nang, Vietnam", "Da Nang", "Asia/Ho_Chi_Minh", 600))))
                .isInstanceOf(AppException.class).hasMessage("error.performance.version-conflict");
    }

    @Test
    void venuesAreScopedToTheOrganization() {
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> venues.update(other, venue, new VenueLibrary.Edit(0L, "Room",
                "1 Street, Da Nang, Vietnam", null, null, null)))).isInstanceOf(AppException.class)
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        assertThatThrownBy(() -> tx(() -> venues.addSpace(other, venue, "Hall"))).isInstanceOf(AppException.class);
    }

    // ---- bulk, duplicate, apply ----

    @Test
    void addsSeveralDraftDatesAtOnceWithDefaultTimes() {
        var starts = List.of(days(10, 19), days(11, 19), days(12, 19));
        var created = tx(() -> scheduling.bulk(owner, owner, event, new PerformanceScheduling.Bulk(starts, null, space,
                120, 30, days(1, 8), "Asia/Ho_Chi_Minh")));
        assertThat(created).hasSize(3).allSatisfy(item -> {
            assertThat(item.status()).isEqualTo("DRAFT");
            assertThat(item.endsAt()).isEqualTo(item.startsAt().plusHours(2));
            assertThat(item.doorsOpenAt()).isEqualTo(item.startsAt().minusMinutes(30));
            assertThat(item.saleEndAt()).isEqualTo(item.startsAt());
        });
        assertThat(catalog.event(event, owner).performances()).hasSize(3);
    }

    @Test
    void aBadDateCreatesNothingAndNamesTheFailingDates() {
        var past = OffsetDateTime.now(ZoneOffset.UTC).minusDays(1);
        var good = days(10, 19);
        assertThatThrownBy(() -> tx(() -> scheduling.bulk(owner, owner, event, new PerformanceScheduling.Bulk(
                List.of(good, past, good), null, space, 120, 30, null, "Asia/Ho_Chi_Minh"))))
                .isInstanceOf(AppException.class).hasMessage("error.performance.bulk-invalid-dates")
                .satisfies(failure -> {
                    var app = (AppException) failure;
                    assertThat(app.getErrorCode()).isEqualTo(ErrorCode.UNPROCESSABLE);
                    assertThat(app.messageArguments()[0].toString()).contains(past.toString()).contains(good.toString());
                });
        assertThat(catalog.event(event, owner).performances()).isEmpty();
    }

    @Test
    void bulkRefusesMoreThanThirtyDatesAndOtherOrganizations() {
        var many = new ArrayList<OffsetDateTime>();
        for (int day = 1; day <= 31; day++) many.add(days(day + 5, 19));
        assertThatThrownBy(() -> tx(() -> scheduling.bulk(owner, owner, event, new PerformanceScheduling.Bulk(many, null,
                space, 120, 30, null, "Asia/Ho_Chi_Minh")))).hasMessage("error.performance.bulk-too-many");
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> scheduling.bulk(other, other, event, new PerformanceScheduling.Bulk(
                List.of(days(9, 19)), null, space, 120, 30, null, "Asia/Ho_Chi_Minh"))))
                .isInstanceOf(AppException.class)
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        assertThat(catalog.event(event, owner).performances()).isEmpty();
    }

    @Test
    void bulkWithASourceCopiesItsSetupToEveryDate() {
        var source = withSale(newPerformance(10));
        var created = tx(() -> scheduling.bulk(owner, owner, event, new PerformanceScheduling.Bulk(
                List.of(days(20, 19), days(21, 19)), source.id(), null, null, null, null, null)));
        assertThat(created).hasSize(2);
        for (var copy : created) {
            var sale = store.sale(copy.id());
            assertThat(sale.groups()).hasSize(2);
            assertThat(sale.offers()).hasSize(2);
        }
        assertThat(store.sale(created.get(0).id()).offers().get(0).id())
                .isNotEqualTo(store.sale(created.get(1).id()).offers().get(0).id());
    }

    @Test
    void duplicatesAReleasedPerformanceIntoAShiftedDraftAndLeavesTheSourceAlone() {
        var source = released(10);
        var sourceSale = store.sale(source.id());
        store.saveDraftLayout(source.id(), 1, assignedLayout());
        var start = source.startsAt().plusDays(7);
        var copy = tx(() -> scheduling.duplicate(owner, owner, source.id(), start));
        assertThat(copy.status()).isEqualTo("DRAFT");
        assertThat(copy.venueSpaceId()).isEqualTo(space);
        assertThat(copy.timezone()).isEqualTo(source.timezone());
        assertThat(copy.endsAt()).isEqualTo(source.endsAt().plusDays(7));
        assertThat(copy.doorsOpenAt()).isEqualTo(source.doorsOpenAt().plusDays(7));
        assertThat(copy.saleStartAt()).isEqualTo(source.saleStartAt().plusDays(7));
        assertThat(copy.saleEndAt()).isEqualTo(source.saleEndAt().plusDays(7));
        var copiedSale = store.sale(copy.id());
        assertThat(copiedSale.groups()).extracting("id").containsExactlyElementsOf(
                sourceSale.groups().stream().map(PerformanceSale.Group::id).toList());
        assertThat(copiedSale.offers()).extracting("name", "price", "groupId").containsExactlyElementsOf(
                sourceSale.offers().stream().map(offer -> org.assertj.core.groups.Tuple.tuple(offer.name(), offer.price(),
                        offer.groupId())).toList());
        assertThat(copiedSale.offers()).extracting("id").doesNotContainAnyElementsOf(
                sourceSale.offers().stream().map(PerformanceSale.Offer::id).toList());
        assertThat(copiedSale.offers().getFirst().saleEndAt())
                .isEqualTo(sourceSale.offers().getFirst().saleEndAt().plusDays(7));
        assertThat(store.draftLayout(copy.id())).isPresent();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_publication_reviews WHERE performance_id=?",
                Integer.class, copy.id())).isZero();
        var untouched = store.publicPerformance(source.id()).orElseThrow();
        assertThat(untouched.status()).isEqualTo("ON_SALE");
        assertThat(untouched.saleVersion()).isEqualTo(source.saleVersion());
        assertThat(store.sale(source.id())).isEqualTo(sourceSale);
    }

    @Test
    void aShiftedSaleStartThatIsAlreadyPastIsLeftEmpty() {
        var source = newPerformance(10);
        var past = OffsetDateTime.now(ZoneOffset.UTC).minusDays(30).withNano(0);
        jdbc.update("UPDATE performances SET sale_start_at=? WHERE id=?", past, source.id());
        var copy = tx(() -> scheduling.duplicate(owner, owner, source.id(), source.startsAt().plusHours(5)));
        assertThat(copy.saleStartAt()).isNull();
        assertThat(copy.saleEndAt()).isEqualTo(source.saleEndAt().plusHours(5));
    }

    @Test
    void duplicateIsRefusedForOtherOrganizationsLegacyConcertsAndPastStarts() {
        var source = newPerformance(10);
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> scheduling.duplicate(other, other, source.id(), source.startsAt().plusDays(1))))
                .isInstanceOf(AppException.class)
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        UUID legacy = jdbc.queryForObject("SELECT id FROM concerts ORDER BY id LIMIT 1", UUID.class);
        assertThatThrownBy(() -> tx(() -> scheduling.duplicate(owner, owner, legacy, source.startsAt().plusDays(1))))
                .isInstanceOf(AppException.class)
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        assertThatThrownBy(() -> tx(() -> scheduling.duplicate(owner, owner, source.id(),
                OffsetDateTime.now(ZoneOffset.UTC).minusDays(1)))).isInstanceOf(AppException.class);
        assertThat(catalog.event(event, owner).performances()).hasSize(1);
    }

    @Test
    void duplicatingALargeMapCopiesEverySeatWithinTheTimeBudget() {
        var source = newPerformance(10);
        int rows = 100;
        int perRow = 200;
        var groupId = UUID.randomUUID();
        var seats = new ArrayList<PerformanceSale.Seat>();
        for (int row = 0; row < rows; row++) {
            for (int seat = 0; seat < perRow; seat++) {
                seats.add(new PerformanceSale.Seat(UUID.randomUUID(), "R" + row, "S" + seat, false));
            }
        }
        var group = new PerformanceSale.Group(groupId, UUID.randomUUID(), "Stalls", Kind.ASSIGNED, rows * perRow, seats);
        var offer = new PerformanceSale.Offer(UUID.randomUUID(), groupId, "Stalls", BigDecimal.valueOf(500_000), "VND",
                source.saleStartAt(), source.saleEndAt(), true, null, 1);
        tx(() -> { store.saveSale(source.id(), 1, new PerformanceSale(List.of(group), List.of(offer))); return null; });
        long begin = System.nanoTime();
        var copy = tx(() -> scheduling.duplicate(owner, owner, source.id(), source.startsAt().plusDays(1)));
        assertThat(Duration.ofNanos(System.nanoTime() - begin)).isLessThan(Duration.ofSeconds(30));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_sale_group_seats WHERE performance_id=?",
                Integer.class, copy.id())).isEqualTo(rows * perRow);
    }

    @Test
    void appliesPricingToMatchingDraftsInOneTransaction() {
        var source = withSale(newPerformance(10));
        var first = newPerformance(11);
        var second = newPerformance(12);
        copyPools(source, first);
        copyPools(source, second);
        var applied = tx(() -> scheduling.applyPricing(owner, owner, source.id(), List.of(
                new PerformanceScheduling.Target(first.id(), 1L), new PerformanceScheduling.Target(second.id(), 1L))));
        assertThat(applied).extracting("saleVersion").containsExactly(2L, 2L);
        for (var target : List.of(first, second)) {
            var offers = store.sale(target.id()).offers();
            assertThat(offers).extracting("name").containsExactly("Standard", "Standard");
            assertThat(offers).allSatisfy(offer -> assertThat(offer.saleEndAt()).isBeforeOrEqualTo(target.saleEndAt()));
        }
    }

    @Test
    void applyingPricingChangesNoTargetWhenOneDoesNotQualify() {
        var source = withSale(newPerformance(10));
        var good = newPerformance(11);
        var otherPools = withSale(newPerformance(12));
        var stale = newPerformance(13);
        var locked = withSale(newPerformance(14));
        copyPools(source, good);
        copyPools(source, stale);
        assertThatThrownBy(() -> tx(() -> scheduling.applyPricing(owner, owner, source.id(), List.of(
                new PerformanceScheduling.Target(good.id(), 1L), new PerformanceScheduling.Target(otherPools.id(), 1L)))))
                .hasMessage("error.performance.apply-pools");
        assertThatThrownBy(() -> tx(() -> scheduling.applyPricing(owner, owner, source.id(), List.of(
                new PerformanceScheduling.Target(good.id(), 1L), new PerformanceScheduling.Target(stale.id(), 9L)))))
                .isInstanceOf(AppException.class).hasMessage("error.performance.apply-stale")
                .extracting(failure -> ((AppException) failure).getErrorCode())
                .isEqualTo(ErrorCode.PERFORMANCE_VERSION_CONFLICT);
        submitForReview(locked, ReleaseMode.SCHEDULED, OffsetDateTime.now(ZoneOffset.UTC).plusHours(2));
        assertThatThrownBy(() -> tx(() -> scheduling.applyPricing(owner, owner, source.id(), List.of(
                new PerformanceScheduling.Target(good.id(), 1L), new PerformanceScheduling.Target(locked.id(), 1L)))))
                .hasMessage("error.performance.apply-not-draft");
        var releasedTarget = released(15);
        assertThatThrownBy(() -> tx(() -> scheduling.applyPricing(owner, owner, source.id(), List.of(
                new PerformanceScheduling.Target(releasedTarget.id(), 2L))))).hasMessage("error.performance.apply-not-draft");
        assertThat(store.sale(good.id()).offers()).isEmpty();
        assertThat(catalog.sale(owner, good.id()).version()).isEqualTo(1);
    }

    // ---- release mode ----

    @Test
    void releaseAsSoonAsApprovedRecordsTheApprovalTimeAndPublishesOnTheNextRun() {
        var draft = withSale(newPerformance(10));
        var submitted = submitForReview(draft, ReleaseMode.ON_APPROVAL, null);
        assertThat(submitted.review().releaseOnApproval()).isTrue();
        assertThat(submitted.review().publishAt()).isNull();
        var before = OffsetDateTime.now();
        var approved = tx(() -> reviews.decide(draft.id(), submitted.review().id(), UUID.randomUUID(), Action.APPROVE, null));
        assertThat(approved.publishAt()).isBetween(before.minusSeconds(1), OffsetDateTime.now().plusSeconds(1));
        tx(() -> { reviews.release(draft.id()); return null; });
        assertThat(tx(() -> catalog.publication(owner, draft.id())).status()).isEqualTo("ON_SALE");
        assertThat(reviewState(draft.id())).isEqualTo("RELEASED");
    }

    @Test
    void approvalAfterTheSaleStartIsRefusedAndTheDraftStaysPrivate() {
        var draft = withSale(newPerformance(10));
        var submitted = submitForReview(draft, ReleaseMode.ON_APPROVAL, null);
        jdbc.update("UPDATE performances SET sale_start_at=now()-interval '1 minute' WHERE id=?", draft.id());
        assertThatThrownBy(() -> tx(() -> reviews.decide(draft.id(), submitted.review().id(), UUID.randomUUID(),
                Action.APPROVE, null))).isInstanceOf(AppException.class).hasMessage("error.performance.release-window");
        assertThat(reviewState(draft.id())).isEqualTo("SUBMITTED");
        assertThat(tx(() -> catalog.publication(owner, draft.id())).status()).isEqualTo("DRAFT");
    }

    @Test
    void scheduledReleaseKeepsItsRulesAndRepeatedSubmissionIsIdempotentPerMode() {
        var draft = withSale(newPerformance(10));
        var at = OffsetDateTime.now(ZoneOffset.UTC).plusHours(2).withNano(0);
        var first = submitForReview(draft, ReleaseMode.SCHEDULED, at);
        assertThat(first.review().publishAt()).isEqualTo(at);
        assertThat(first.review().releaseOnApproval()).isFalse();
        assertThat(submitForReview(draft, ReleaseMode.SCHEDULED, at).review().id()).isEqualTo(first.review().id());
        var switched = submitForReview(draft, ReleaseMode.ON_APPROVAL, null);
        assertThat(switched.review().id()).isNotEqualTo(first.review().id());
        assertThat(jdbc.queryForObject("SELECT state FROM performance_publication_reviews WHERE id=?", String.class,
                first.review().id())).isEqualTo("SUPERSEDED");
        assertThatThrownBy(() -> submitForReview(draft, ReleaseMode.SCHEDULED, null)).isInstanceOf(AppException.class);
        assertThatThrownBy(() -> submitForReview(draft, ReleaseMode.ON_APPROVAL, at)).isInstanceOf(AppException.class);
    }

    @Test
    void anEditAfterAReleaseOnApprovalSubmissionSupersedesItWithoutReleasing() {
        var draft = withSale(newPerformance(10));
        var submitted = submitForReview(draft, ReleaseMode.ON_APPROVAL, null);
        var approved = tx(() -> reviews.decide(draft.id(), submitted.review().id(), UUID.randomUUID(), Action.APPROVE, null));
        tx(() -> catalog.saveSale(owner, owner, draft.id(), 1, store.sale(draft.id())));
        tx(() -> { reviews.release(draft.id()); return null; });
        assertThat(approved.state().name()).isEqualTo("SCHEDULED");
        assertThat(reviewState(draft.id())).isEqualTo("SUPERSEDED");
        assertThat(tx(() -> catalog.publication(owner, draft.id())).status()).isEqualTo("DRAFT");
    }

    // ---- pause and resume ----

    @Test
    void pauseAndResumePublishConsecutiveSuspendedVersionsThroughTheDisruptionPath() {
        var live = released(10);
        UUID action = UUID.randomUUID();
        var paused = tx(() -> sales.pause(owner, owner, live.id(), action, "Technical check"));
        assertThat(paused.state()).isIn("PAUSING", "PAUSED");
        assertThat(version(live)).isEqualTo(3L);
        assertThat(jdbc.queryForObject("SELECT sales_suspended FROM performances WHERE id=?", Boolean.class, live.id())).isTrue();
        assertThat(jdbc.queryForObject("SELECT (payload->>'salesSuspended')::boolean FROM performance_sale_publications WHERE performance_id=? AND version=3",
                Boolean.class, live.id())).isTrue();
        assertThat(jdbc.queryForObject("SELECT payload->>'status' FROM performance_sale_publications WHERE performance_id=? AND version=3",
                String.class, live.id())).isEqualTo("ON_SALE");
        // Replaying the action returns the recorded pause without another version.
        assertThat(tx(() -> sales.pause(owner, owner, live.id(), action, "Technical check")).id()).isEqualTo(action);
        assertThat(version(live)).isEqualTo(3L);
        acknowledgeEverything();
        assertThat(tx(() -> sales.state(owner, live.id())).pause().state()).isEqualTo("PAUSED");

        var resumed = tx(() -> sales.resume(owner, owner, live.id(), action));
        assertThat(resumed.state()).isIn("RESUMING", "RESUMED");
        assertThat(version(live)).isEqualTo(4L);
        assertThat(jdbc.queryForObject("SELECT sales_suspended FROM performances WHERE id=?", Boolean.class, live.id())).isFalse();
        assertThat(tx(() -> sales.resume(owner, owner, live.id(), action)).id()).isEqualTo(action);
        assertThat(version(live)).isEqualTo(4L);
    }

    @Test
    void pauseIsRefusedWhenIneligibleOrForeign() {
        var draft = newPerformance(10);
        assertThatThrownBy(() -> tx(() -> sales.pause(owner, owner, draft.id(), UUID.randomUUID(), "Why")))
                .hasMessage("error.performance.invalid-sales-control");
        var live = released(11);
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> sales.pause(other, other, live.id(), UUID.randomUUID(), "Why")))
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        assertThatThrownBy(() -> tx(() -> sales.pause(owner, owner, live.id(), UUID.randomUUID(), " ")))
                .hasMessage("error.performance.invalid-sales-control");
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=false WHERE performance_id=?", live.id());
        assertThatThrownBy(() -> tx(() -> sales.pause(owner, owner, live.id(), UUID.randomUUID(), "Not yet acknowledged")))
                .hasMessage("error.performance.invalid-sales-control");
        acknowledgeEverything();
        tx(() -> sales.pause(owner, owner, live.id(), UUID.randomUUID(), "First"));
        acknowledgeEverything();
        assertThatThrownBy(() -> tx(() -> sales.pause(owner, owner, live.id(), UUID.randomUUID(), "Second")))
                .hasMessage("error.performance.invalid-sales-control");
        assertThat(version(live)).isEqualTo(3L);
    }

    @Test
    void anEndedPerformanceCannotBePaused() {
        var live = released(10);
        jdbc.update("""
                UPDATE performances SET sale_start_at=now()-interval '2 days', sale_end_at=now()-interval '3 hours',
                    doors_open_at=NULL, starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour' WHERE id=?
                """, live.id());
        assertThatThrownBy(() -> tx(() -> sales.pause(owner, owner, live.id(), UUID.randomUUID(), "Late")))
                .hasMessage("error.performance.invalid-sales-control");
    }

    @Test
    void aPlatformDisruptionTakesOverAnOrganizerPauseAndOnlyOperationsEndsIt() {
        var live = released(10);
        UUID pause = UUID.randomUUID();
        tx(() -> sales.pause(owner, owner, live.id(), pause, "Rain"));
        acknowledgeEverything();
        var status = tx(() -> disruptions.confirm(live.id(), UUID.randomUUID(), cancel(null)));
        assertThat(status.kind()).isEqualTo(CANCEL);
        assertThat(jdbc.queryForObject("SELECT closed_reason FROM performance_sales_pauses WHERE id=?", String.class, pause))
                .isEqualTo("SUPERSEDED");
        assertThatThrownBy(() -> tx(() -> sales.resume(owner, owner, live.id(), pause)))
                .hasMessage("error.performance.invalid-sales-control");
        assertThat(tx(() -> sales.state(owner, live.id())).disruption().state()).isIn("PAUSING", "CANCELLED");
    }

    @Test
    void aPauseCannotStartDuringAPostponement() {
        var live = released(10);
        var postponed = tx(() -> disruptions.confirm(live.id(), UUID.randomUUID(), new PerformanceDisruptions.Command(
                UUID.randomUUID(), POSTPONE, "Weather", live.startsAt().plusDays(3), live.endsAt().plusDays(3),
                live.doorsOpenAt().plusDays(3), live.saleStartAt(), live.saleEndAt().plusDays(3), null, null)));
        assertThat(postponed.kind()).isEqualTo(POSTPONE);
        acknowledgeEverything();
        assertThatThrownBy(() -> tx(() -> sales.pause(owner, owner, live.id(), UUID.randomUUID(), "Too late")))
                .hasMessage("error.performance.invalid-sales-control");
    }

    @Test
    void concurrentPauseAndDisruptionLeaveOneConsistentOutcome() {
        var live = released(10);
        UUID pause = UUID.randomUUID();
        var pausing = CompletableFuture.supplyAsync(() -> attempt(() -> tx(() ->
                sales.pause(owner, owner, live.id(), pause, "Race"))));
        var disrupting = CompletableFuture.supplyAsync(() -> attempt(() -> tx(() ->
                disruptions.confirm(live.id(), UUID.randomUUID(), cancel(null)))));
        boolean paused = pausing.join();
        boolean disrupted = disrupting.join();
        assertThat(paused || disrupted).isTrue();
        int openPauses = jdbc.queryForObject(
                "SELECT count(*) FROM performance_sales_pauses WHERE performance_id=? AND closed_reason IS NULL",
                Integer.class, live.id());
        int disruptionRows = jdbc.queryForObject("SELECT count(*) FROM performance_disruptions WHERE performance_id=?",
                Integer.class, live.id());
        if (disrupted) assertThat(openPauses).isZero();
        assertThat(disruptionRows).isEqualTo(disrupted ? 1 : 0);
        assertThat(jdbc.queryForObject("SELECT sales_suspended FROM performances WHERE id=?", Boolean.class, live.id())).isTrue();
    }

    @Test
    void concurrentResumesPublishOneVersion() {
        var live = released(10);
        UUID pause = UUID.randomUUID();
        tx(() -> sales.pause(owner, owner, live.id(), pause, "Break"));
        acknowledgeEverything();
        var one = CompletableFuture.supplyAsync(() -> attempt(() -> tx(() -> sales.resume(owner, owner, live.id(), pause))));
        var two = CompletableFuture.supplyAsync(() -> attempt(() -> tx(() -> sales.resume(owner, owner, live.id(), pause))));
        assertThat(one.join() && two.join()).isTrue();
        assertThat(version(live)).isEqualTo(4L);
    }

    // ---- disruption requests ----

    @Test
    void anOrganizerRequestsAPostponementAndOperationsAcceptsItThroughTheDisruption() {
        var live = released(10);
        var start = live.startsAt().plusDays(5);
        var request = tx(() -> requests.create(owner, owner, live.id(), new PerformanceDisruptionRequests.Command(
                "POSTPONE", "Venue flooded", start, start.plusHours(2), start.minusMinutes(30), false)));
        assertThat(request.state()).isEqualTo("REQUESTED");
        assertThat(tx(() -> requests.queue("REQUESTED"))).extracting(item -> item.request().id()).contains(request.id());
        assertThat(version(live)).isEqualTo(2L);
        assertThatThrownBy(() -> tx(() -> requests.create(owner, owner, live.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Again", null, null, null, false)))).hasMessage("error.performance.invalid-disruption-request");

        var status = tx(() -> disruptions.confirm(live.id(), UUID.randomUUID(), new PerformanceDisruptions.Command(
                UUID.randomUUID(), POSTPONE, "Venue flooded", start, start.plusHours(2), start.minusMinutes(30),
                live.saleStartAt(), start.minusHours(2), null, request.id())));
        var accepted = tx(() -> requests.item(request.id())).request();
        assertThat(accepted.state()).isEqualTo("ACCEPTED");
        assertThat(accepted.disruptionId()).isEqualTo(status.id());
        assertThat(tx(() -> sales.state(owner, live.id())).request().state()).isEqualTo("ACCEPTED");
        assertThat(tx(() -> sales.state(owner, live.id())).disruption().id()).isEqualTo(status.id());
    }

    @Test
    void confirmingAnotherPerformancesOrClosedRequestIsRefused() {
        var live = released(10);
        var other = released(11);
        var request = tx(() -> requests.create(owner, owner, other.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Cancel it", null, null, null, false)));
        assertThatThrownBy(() -> tx(() -> disruptions.confirm(live.id(), UUID.randomUUID(), cancel(request.id()))))
                .hasMessage("error.performance.invalid-disruption");
        tx(() -> requests.withdraw(owner, owner, other.id(), request.id()));
        assertThatThrownBy(() -> tx(() -> disruptions.confirm(other.id(), UUID.randomUUID(), cancel(request.id()))))
                .hasMessage("error.performance.invalid-disruption");
    }

    @Test
    void requestWithPauseCommitsBothOrNeither() {
        var live = released(10);
        var created = tx(() -> requests.create(owner, owner, live.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Safety", null, null, null, true)));
        assertThat(created.state()).isEqualTo("REQUESTED");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_sales_pauses WHERE performance_id=?", Integer.class,
                live.id())).isEqualTo(1);
        var paused = released(11);
        tx(() -> sales.pause(owner, owner, paused.id(), UUID.randomUUID(), "Already"));
        acknowledgeEverything();
        assertThatThrownBy(() -> tx(() -> requests.create(owner, owner, paused.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Safety", null, null, null, true)))).isInstanceOf(AppException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_disruption_requests WHERE performance_id=?",
                Integer.class, paused.id())).isZero();
    }

    @Test
    void operationsDeclinesAndTheOrganizerWithdrawsWithoutChangingTheSale() {
        var live = released(10);
        var other = released(11);
        var declined = tx(() -> requests.create(owner, owner, live.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Please", null, null, null, false)));
        assertThatThrownBy(() -> tx(() -> requests.decline(declined.id(), UUID.randomUUID(), " ")))
                .hasMessage("error.performance.decline-reason");
        var item = tx(() -> requests.decline(declined.id(), UUID.randomUUID(), "Not needed"));
        assertThat(item.request().state()).isEqualTo("DECLINED");
        assertThat(item.request().decisionReason()).isEqualTo("Not needed");
        assertThatThrownBy(() -> tx(() -> requests.decline(declined.id(), UUID.randomUUID(), "Twice")))
                .hasMessage("error.performance.invalid-disruption-request");
        var withdrawn = tx(() -> requests.create(owner, owner, other.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Oops", null, null, null, false)));
        assertThat(tx(() -> requests.withdraw(owner, owner, other.id(), withdrawn.id())).state()).isEqualTo("WITHDRAWN");
        assertThat(version(live)).isEqualTo(2L);
        assertThat(version(other)).isEqualTo(2L);
        assertThat(tx(() -> requests.create(owner, owner, live.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Again", null, null, null, false))).state()).isEqualTo("REQUESTED");
    }

    @Test
    void requestsAreRefusedForDraftsOtherOrganizationsAndBadSchedules() {
        var draft = newPerformance(10);
        var live = released(11);
        assertThatThrownBy(() -> tx(() -> requests.create(owner, owner, draft.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Draft", null, null, null, false)))).hasMessage("error.performance.invalid-disruption-request");
        UUID other = UUID.randomUUID();
        assertThatThrownBy(() -> tx(() -> requests.create(other, other, live.id(), new PerformanceDisruptionRequests.Command(
                "CANCEL", "Not mine", null, null, null, false)))).isInstanceOf(AppException.class)
                .extracting(failure -> ((AppException) failure).getErrorCode()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        assertThatThrownBy(() -> tx(() -> requests.create(owner, owner, live.id(), new PerformanceDisruptionRequests.Command(
                "POSTPONE", "No dates", null, null, null, false)))).hasMessage("error.performance.invalid-proposed-schedule");
        assertThatThrownBy(() -> tx(() -> requests.withdraw(other, other, live.id(), UUID.randomUUID())))
                .isInstanceOf(AppException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM performance_disruption_requests WHERE performance_id IN (?,?)",
                Integer.class, draft.id(), live.id())).isZero();
    }

    // ---- HTTP surface ----

    @Test
    void theHttpSurfaceMapsErrorsAndExposesTheOrganizerAndAdminRoutes() throws Exception {
        var live = released(10);
        var body = json.createObjectNode().put("actionId", UUID.randomUUID().toString()).put("reason", "Check");
        mvc.perform(MockMvcRequestBuilders.post(ORGANIZER + "/performances/" + live.id() + "/sales/pause")
                        .requestAttr(OrganizationAccess.ORGANIZATION, owner).principal(owner::toString)
                        .contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isOk());
        mvc.perform(MockMvcRequestBuilders.get(ORGANIZER + "/performances/" + live.id() + "/sales")
                        .requestAttr(OrganizationAccess.ORGANIZATION, owner).principal(owner::toString))
                .andExpect(status().isOk());
        var bulk = json.createObjectNode();
        bulk.putArray("startsAt").add(OffsetDateTime.now(ZoneOffset.UTC).minusDays(2).toString());
        bulk.put("venueSpaceId", space.toString()).put("timezone", "Asia/Ho_Chi_Minh");
        mvc.perform(MockMvcRequestBuilders.post(ORGANIZER + "/events/" + event + "/performances/bulk")
                        .requestAttr(OrganizationAccess.ORGANIZATION, owner).principal(owner::toString)
                        .contentType(MediaType.APPLICATION_JSON).content(bulk.toString()))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(MockMvcRequestBuilders.get("/api/admin/v2/performance-disruption-requests")).andExpect(status().isOk());
        mvc.perform(MockMvcRequestBuilders.get("/api/admin/v2/performance-disruption-requests?state=NOPE"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void organizerControllersRequireTheEventsGrantAndTheAdminQueueLivesUnderTheAdminPath() {
        for (var type : List.of(OrganizerSchedulingController.class, OrganizerSalesController.class)) {
            var permission = type.getAnnotation(OrganizerPermission.class);
            assertThat(permission).isNotNull();
            assertThat(permission.value()).containsExactly(OrganizerPermission.Grant.EVENTS);
        }
        assertThat(PerformanceDisruptionRequestController.class.getAnnotation(
                org.springframework.web.bind.annotation.RequestMapping.class).value()[0]).startsWith("/api/admin/");
    }

    // ---- helpers ----

    private static boolean attempt(Supplier<?> action) {
        try {
            action.get();
            return true;
        } catch (AppException | org.springframework.dao.DataAccessException refused) {
            return false;
        }
    }

    private PerformanceDisruptions.Command cancel(UUID requestId) {
        return new PerformanceDisruptions.Command(UUID.randomUUID(), CANCEL, "Cancelled", null, null, null, null,
                null, null, requestId);
    }

    private static long version(Performance performance) {
        return jdbc.queryForObject("SELECT sale_version FROM performances WHERE id=?", Long.class, performance.id());
    }

    private static void acknowledgeEverything() {
        jdbc.update("UPDATE performance_sale_publications SET ticketing_ack=true, checkin_ack=true");
    }

    private org.ticketbox.catalog.performance.application.PerformanceViews.Venue venue(UUID id) {
        return store.venue(id, owner).orElseThrow();
    }

    private static OffsetDateTime days(int days, int hour) {
        return OffsetDateTime.now(ZoneOffset.UTC).plusDays(days).withHour(hour).withMinute(0).withSecond(0).withNano(0);
    }

    private Performance newPerformance(int days) {
        var starts = OffsetDateTime.now(ZoneOffset.UTC).plusDays(days).withNano(0);
        var schedule = new PerformanceCatalog.Schedule(space, starts, starts.plusHours(2), starts.minusHours(1),
                "Asia/Ho_Chi_Minh", starts.minusDays(2), starts.minusHours(2), 4, true);
        return tx(() -> catalog.createPerformance(owner, event, schedule));
    }

    /** A draft with two general admission pools and one ticket type each (sale version 1). */
    private Performance withSale(Performance draft) {
        tx(() -> catalog.saveSale(owner, owner, draft.id(), 0, maplessSale(draft)));
        return draft;
    }

    /** An on-sale performance whose publications are acknowledged: sale version 2. */
    private Performance released(int days) {
        var draft = withSale(newPerformance(days));
        tx(() -> catalog.publish(owner, owner, draft.id(), 1L, 0L, null, null));
        acknowledgeEverything();
        return tx(() -> store.lockOwnedPerformance(draft.id(), owner)).orElseThrow();
    }

    private void copyPools(Performance source, Performance target) {
        var groups = store.sale(source.id()).groups();
        tx(() -> { store.saveSale(target.id(), 1, new PerformanceSale(groups, List.of())); return null; });
    }

    private PerformancePublicationReview.Status submitForReview(Performance draft, ReleaseMode mode, OffsetDateTime at) {
        if (store.sale(draft.id()).groups().isEmpty()) withSale(draft);
        var current = catalog.event(event, owner);
        var fresh = tx(() -> store.lockOwnedPerformance(draft.id(), owner)).orElseThrow();
        var layout = store.draftLayout(draft.id()).map(value -> value.version()).orElse(0L);
        var versions = new Versions(fresh.saleVersion(), layout, current.draftVersion(), fresh.draftVersion());
        return tx(() -> reviews.submit(owner, owner, draft.id(), versions, mode, at));
    }

    private String reviewState(UUID performance) {
        return tx(() -> reviews.status(owner, performance)).review().state().name();
    }

    private static PerformanceSale maplessSale(Performance performance) {
        var start = performance.saleStartAt();
        var end = performance.saleEndAt();
        var one = new PerformanceSale.Group(UUID.randomUUID(), null, "Floor", Kind.GA, 250, List.of());
        var two = new PerformanceSale.Group(UUID.randomUUID(), null, "Balcony", Kind.GA, 40, List.of());
        return new PerformanceSale(List.of(one, two), List.of(offer(one.id(), start, end), offer(two.id(), start, end)));
    }

    private static PerformanceSale.Offer offer(UUID pool, OffsetDateTime start, OffsetDateTime end) {
        return new PerformanceSale.Offer(UUID.randomUUID(), pool, "Standard", BigDecimal.valueOf(100_000), "VND", start,
                end, true, null, 1);
    }

    private static PerformanceLayout assignedLayout() {
        var bounds = List.of(new Point(10, 10), new Point(50, 10), new Point(50, 50), new Point(10, 50));
        var seat = new PerformanceLayout.Seat(UUID.randomUUID(), "Seat 1", 25, 25, true, false, "front", 0, false);
        var row = new PerformanceLayout.Row(UUID.randomUUID(), "A", "Row A", List.of(seat));
        var section = new PerformanceLayout.Section(UUID.randomUUID(), "A", "Section A", Kind.ASSIGNED, bounds, List.of(row));
        return new PerformanceLayout(60, 60, null, List.of(), List.of(section));
    }

    private static <T> T tx(Supplier<T> action) {
        return transaction.execute(status -> action.get());
    }
}
