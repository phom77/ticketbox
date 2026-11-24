package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.performance.application.PerformanceViews.*;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceRules;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

@Service
public class PerformanceCatalog {
    private final PerformanceStore store;
    private final Set<String> publishingOrganizations;

    public PerformanceCatalog(PerformanceStore store,
                              @Value("${ticketbox.performance-sales.organizations:}") String organizations) {
        this.store = store;
        publishingOrganizations = Arrays.stream(organizations.split(",")).map(String::trim)
                .collect(Collectors.toUnmodifiableSet());
    }

    @Transactional(readOnly = true)
    public Page<Event> events(UUID owner, Pageable page) {
        return store.events(owner, page);
    }

    @Transactional(readOnly = true)
    public PerformanceViews.DiscoveryFacets discoveryFacets() {
        return store.discoveryFacets();
    }

    public Page<DiscoveryCard> discover(DiscoveryQuery query, Pageable page) {
        return store.discover(query, page);
    }

    @Transactional(readOnly = true)
    public Event event(UUID id, UUID owner) {
        return store.event(id, owner).orElseThrow(PerformanceCatalog::missing);
    }

    @Transactional(readOnly = true)
    public Page<OperationsPerformance> operationsPerformances(String query, Pageable page) {
        return store.operationsPerformances(query, page);
    }

    @Transactional(readOnly = true)
    public OperationsPerformance operationsPerformance(UUID id) {
        return store.operationsPerformance(id).orElseThrow(PerformanceCatalog::missing);
    }

    @Transactional
    public Event createEvent(UUID owner, String title, String description, String category) {
        validateEvent(title, description, category);
        UUID id = UUID.randomUUID();
        store.createEvent(id, owner, title.trim(), description, category);
        return event(id, owner);
    }

    @Transactional
    public Event updateDraftEvent(UUID owner, UUID id, Long expected, String title, String description, String category) {
        long current = store.lockNativeEventVersion(id, owner).orElseThrow(PerformanceCatalog::missing);
        require(!store.hasReleasedPerformances(id), "error.performance.event-draft-locked");
        requireDraftVersion(expected, current);
        validateEvent(title, description, category);
        store.updateDraftEvent(id, title.trim(), description, category);
        return event(id, owner);
    }

    private static void validateEvent(String title, String description, String category) {
        require(PerformanceRules.text(title, 500) && (description == null || description.length() <= 60_000)
                        && (category == null || PerformanceRules.text(category, 100)),
                "error.performance.invalid-event");
    }

    @Transactional(readOnly = true)
    public List<Venue> venues(UUID owner) {
        return store.venues(owner);
    }

    @Transactional
    public Venue createVenue(UUID owner, String name, String address, String spaceName) {
        require(PerformanceRules.text(name, 500) && PerformanceRules.text(address, 1000)
                        && PerformanceRules.text(spaceName, 200), "error.performance.invalid-venue");
        UUID id = UUID.randomUUID();
        store.createVenue(id, UUID.randomUUID(), owner, name.trim(), address.trim(), spaceName.trim());
        return store.venue(id, owner).orElseThrow();
    }

    @Transactional
    public Performance createPerformance(UUID owner, UUID event, Schedule schedule) {
        if (!store.ownsNativeEvent(event, owner)) throw missing();
        validateSchedule(owner, schedule);
        return store.createPerformance(UUID.randomUUID(), event, schedule.venueSpaceId(), schedule.startsAt(),
                schedule.endsAt(), schedule.doorsOpenAt(), schedule.timezone(), schedule.saleStartAt(),
                schedule.saleEndAt(), schedule.maxPerAccount(), schedule.publicVisible());
    }

    @Transactional
    public Performance updateDraftSchedule(UUID owner, UUID id, Long expected, Schedule schedule) {
        var performance = owned(owner, id);
        require("DRAFT".equals(performance.status()), "error.performance.schedule-draft-locked");
        requireDraftVersion(expected, performance.draftVersion());
        validateSchedule(owner, schedule);
        return store.updateDraftSchedule(id, schedule.venueSpaceId(), schedule.startsAt(), schedule.endsAt(),
                schedule.doorsOpenAt(), schedule.timezone(), schedule.saleStartAt(), schedule.saleEndAt(),
                schedule.maxPerAccount(), schedule.publicVisible());
    }

    private void validateSchedule(UUID owner, Schedule schedule) {
        if (!store.ownsSpace(schedule.venueSpaceId(), owner)) throw missing();
        PerformanceRules.validateSchedule(schedule.startsAt(), schedule.endsAt(), schedule.doorsOpenAt(),
                schedule.timezone(), schedule.saleStartAt(), schedule.saleEndAt(), schedule.maxPerAccount());
    }

    public record Schedule(UUID venueSpaceId, OffsetDateTime startsAt, OffsetDateTime endsAt,
                           OffsetDateTime doorsOpenAt, String timezone, OffsetDateTime saleStartAt,
                           OffsetDateTime saleEndAt, int maxPerAccount, boolean publicVisible) {}

    @Transactional
    public Sale sale(UUID owner, UUID id) {
        var performance = owned(owner, id);
        var configuration = store.sale(id);
        return new Sale(performance.saleVersion(), configuration.groups(), configuration.offers());
    }

    @Transactional
    public Sale saveSale(UUID owner, UUID actor, UUID id, long expected, PerformanceSale sale) {
        var performance = owned(owner, id);
        version(expected, performance.saleVersion());
        require("DRAFT".equals(performance.status()) || "ON_SALE".equals(performance.status()),
                "error.performance.sale-locked");
        var layout = store.draftLayout(id).map(Layout::layout).orElse(null);
        boolean alreadyPublished = !"DRAFT".equals(performance.status());
        PerformanceRules.validateSale(sale, performance.saleStartAt(), performance.saleEndAt(), layout, false);
        long version = performance.saleVersion() + 1;
        if (alreadyPublished) {
            require(!store.hasPublicationReview(id), "error.performance.sale-locked");
            var current = store.sale(id);
            require(sameGroups(current, sale) && retainsOfferScopes(current, sale), "error.performance.inventory-frozen");
        }
        store.saveSale(id, version, sale);
        if (alreadyPublished) {
            var event = event(performance.eventId(), owner);
            store.savePublication(snapshot(performance, event, owner, version, performance.layoutVersion(),
                    checksum(performance), performance.status(), performance.salesSuspended(), performance.resumedAdmissionAt(), sale), actor,
                    performance.layoutVersion(), performance.status(), performance.salesSuspended());
        }
        return new Sale(version, sale.groups(), sale.offers());
    }

    private static boolean sameGroups(PerformanceSale previous, PerformanceSale requested) {
        return byId(previous.groups(), PerformanceSale.Group::id)
                .equals(byId(requested.groups(), PerformanceSale.Group::id));
    }

    static boolean retainsOfferScopes(PerformanceSale previous, PerformanceSale requested) {
        Map<UUID, PerformanceSale.Offer> byId = byId(requested.offers(), PerformanceSale.Offer::id);
        return previous.offers().stream().allMatch(offer -> byId.containsKey(offer.id())
                && byId.get(offer.id()).groupId().equals(offer.groupId()));
    }

    private static <T> Map<UUID, T> byId(List<T> values, Function<T, UUID> key) {
        return values.stream().collect(Collectors.toMap(key, Function.identity()));
    }

    @Transactional
    public Publication publication(UUID owner, UUID id) {
        return store.publication(owned(owner, id));
    }

    @Transactional
    public Publication publish(UUID owner, UUID actor, UUID id, Long expectedSale, Long expectedLayout,
                               Long expectedEventDraft, Long expectedScheduleDraft) {
        var performance = owned(owner, id);
        if (!"DRAFT".equals(performance.status())) return store.publication(performance);
        var draft = validatePublication(owner, performance, expectedSale, expectedLayout,
                expectedEventDraft, expectedScheduleDraft);
        var sale = store.sale(id);
        Long layoutVersion = draft == null ? null : draft.version();
        String checksum = draft == null ? null : store.freezeLayout(id, draft);
        long saleVersion = performance.saleVersion() + 1;
        store.savePublication(snapshot(performance, event(performance.eventId(), owner), owner, saleVersion,
                layoutVersion, checksum, "ON_SALE", false, null, sale), actor, layoutVersion, "ON_SALE", false);
        return new Publication("ON_SALE", saleVersion, false, false);
    }

    Layout validatePublication(UUID owner, Performance performance, Long expectedSale, Long expectedLayout,
                               Long expectedEventDraft, Long expectedScheduleDraft) {
        if (!publishingOrganizations.contains("*") && !publishingOrganizations.contains(owner.toString())) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "error.performance.rollout-disabled");
        }
        var draft = store.draftLayout(performance.id()).orElse(null);
        if (expectedSale != null) version(expectedSale, performance.saleVersion());
        if (expectedLayout != null) version(expectedLayout, draft == null ? 0 : draft.version());
        if (expectedScheduleDraft != null) version(expectedScheduleDraft, performance.draftVersion());
        long eventVersion = store.lockNativeEventVersion(performance.eventId(), owner)
                .orElseThrow(PerformanceCatalog::missing);
        if (expectedEventDraft != null) version(expectedEventDraft, eventVersion);
        require(performance.saleEndAt().isAfter(OffsetDateTime.now()), "error.performance.sale-window-ended");
        var sale = store.sale(performance.id());
        PerformanceRules.validateSale(sale, performance.saleStartAt(), performance.saleEndAt(),
                draft == null ? null : draft.layout(), true);
        return draft;
    }

    @Transactional
    public Layout draftLayout(UUID owner, UUID id) {
        owned(owner, id);
        return store.draftLayout(id).orElse(new Layout(0, null));
    }

    @Transactional
    public Layout saveLayout(UUID owner, UUID id, long expected, PerformanceLayout layout) {
        requireDraft(owned(owner, id));
        version(expected, store.draftLayout(id).map(Layout::version).orElse(0L));
        PerformanceRules.validateLayout(layout);
        requireBackgroundAccess(owner, layout.backgroundUrl());
        store.saveDraftLayout(id, expected + 1, layout);
        return new Layout(expected + 1, layout);
    }

    @Transactional
    public Layout saveBackground(UUID owner, UUID id, long expected, Background image) {
        requireDraft(owned(owner, id));
        var draft = store.draftLayout(id).orElseThrow(PerformanceCatalog::missing);
        version(expected, draft.version());
        UUID asset = UUID.randomUUID();
        store.storeBackground(asset, owner, id, image);
        var layout = draft.layout().withBackground(privateBackgroundUrl(id, asset));
        store.saveDraftLayout(id, expected + 1, layout);
        return new Layout(expected + 1, layout);
    }

    @Transactional(readOnly = true)
    public Background draftBackground(UUID owner, UUID source, UUID asset) {
        return store.draftBackground(asset, source, owner).orElseThrow(PerformanceCatalog::missing);
    }

    @Transactional(readOnly = true)
    public Background publishedBackground(UUID id, long version, UUID asset) {
        version(version, layoutVersion(id));
        return store.publishedBackground(asset, id, version).orElseThrow(PerformanceCatalog::missing);
    }

    @Transactional(readOnly = true)
    public LayoutOverview layoutOverview(UUID id) {
        return store.layoutOverview(id, layoutVersion(id)).orElseThrow(PerformanceCatalog::missing);
    }

    @Transactional(readOnly = true)
    public LayoutSection layoutSection(UUID id, UUID section) {
        return store.layoutSection(id, layoutVersion(id), section).orElseThrow(PerformanceCatalog::missing);
    }

    @Transactional(readOnly = true)
    public List<Template> templates(UUID owner, UUID venue) {
        store.venue(venue, owner).orElseThrow(PerformanceCatalog::missing);
        return store.templates(venue, owner);
    }

    @Transactional
    public Template createTemplate(
            UUID owner, UUID venue, UUID space, String name, PerformanceLayout layout) {
        var ownedVenue = store.venue(venue, owner).orElseThrow(PerformanceCatalog::missing);
        if (ownedVenue.spaces().stream().noneMatch(value -> value.id().equals(space))) throw missing();
        require(PerformanceRules.text(name, 200), "error.performance.invalid-template");
        PerformanceRules.validateLayout(layout);
        requireBackgroundAccess(owner, layout.backgroundUrl());
        return store.createTemplate(UUID.randomUUID(), owner, space, name.trim(), layout);
    }

    @Transactional
    public Template reviseTemplate(
            UUID owner, UUID venue, UUID id, long expected, PerformanceLayout layout) {
        var current = store.lockTemplate(id, venue, owner).orElseThrow(PerformanceCatalog::missing);
        version(expected, current.revision());
        PerformanceRules.validateLayout(layout);
        requireBackgroundAccess(owner, layout.backgroundUrl());
        return store.saveTemplate(current, layout);
    }

    @Transactional
    public Layout copyTemplate(UUID owner, UUID performance, UUID template, long revision, long expected) {
        var owned = owned(owner, performance);
        requireDraft(owned);
        var source = store.template(template, owned.venueSpaceId(), owner, revision)
                .orElseThrow(PerformanceCatalog::missing);
        return saveLayout(owner, performance, expected, source.layout());
    }

    private long layoutVersion(UUID id) {
        var value = store.publicPerformance(id).orElseThrow(PerformanceCatalog::missing).layoutVersion();
        if (value == null) throw missing();
        return value;
    }

    private Performance owned(UUID owner, UUID id) {
        return store.lockOwnedPerformance(id, owner).orElseThrow(PerformanceCatalog::missing);
    }

    private String checksum(Performance performance) {
        return performance.layoutVersion() == null
                ? null : store.layoutChecksum(performance.id(), performance.layoutVersion());
    }

    private static void requireDraft(Performance performance) {
        require("DRAFT".equals(performance.status()), "error.performance.layout-locked");
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }

    private static void require(boolean condition, String key) {
        if (!condition) throw new AppException(ErrorCode.INVALID_REQUEST, key);
    }

    private static void requireDraftVersion(Long expected, long actual) {
        require(expected != null, "error.performance.expected-draft-version");
        version(expected, actual);
    }

    private static void version(long expected, long actual) {
        if (expected != actual) throw new AppException(ErrorCode.PERFORMANCE_VERSION_CONFLICT,
                "error.performance.version-conflict", actual);
    }

    private void requireBackgroundAccess(UUID owner, String url) {
        if (url == null) return;
        var parts = url.split("/");
        UUID source;
        UUID asset;
        try {
            source = UUID.fromString(parts[6]);
            asset = UUID.fromString(parts[9]);
        } catch (IllegalArgumentException | IndexOutOfBoundsException invalid) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-background");
        }
        require(url.equals(privateBackgroundUrl(source, asset))
                        && store.draftBackground(asset, source, owner).isPresent(),
                "error.performance.invalid-background");
    }

    private static String privateBackgroundUrl(UUID performance, UUID asset) {
        return "/api/organizer/manage/v2/performances/" + performance + "/layout/background/" + asset;
    }

    static SaleSnapshot snapshot(
            Performance performance, Event event, UUID owner, long version, Long layoutVersion, String checksum,
            String status, boolean suspended, OffsetDateTime resumedAdmissionAt, PerformanceSale sale) {
        return new SaleSnapshot(performance.id(), performance.eventId(), owner, version, layoutVersion, checksum,
                event.title(), performance.venueName(), performance.startsAt(), performance.endsAt(),
                performance.doorsOpenAt(), performance.timezone(), performance.saleStartAt(), performance.saleEndAt(),
                status, suspended, resumedAdmissionAt, performance.publicVisible(), performance.maxPerAccount(),
                null, sale.groups(), sale.offers());
    }
}
