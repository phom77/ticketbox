package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.catalog.classification.domain.EventClassification;
import org.ticketbox.catalog.performance.application.PerformanceViews.Background;
import org.ticketbox.catalog.performance.application.PerformanceViews.ConcertCategory;
import org.ticketbox.catalog.performance.application.PerformanceViews.DiscoveryCard;
import org.ticketbox.catalog.performance.application.PerformanceViews.Event;
import org.ticketbox.catalog.performance.application.PerformanceViews.Layout;
import org.ticketbox.catalog.performance.application.PerformanceViews.LayoutOverview;
import org.ticketbox.catalog.performance.application.PerformanceViews.LayoutSection;
import org.ticketbox.catalog.performance.application.PerformanceViews.OperationsPerformance;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;
import org.ticketbox.catalog.performance.application.PerformanceViews.Publication;
import org.ticketbox.catalog.performance.application.PerformanceViews.SaleSnapshot;
import org.ticketbox.catalog.performance.application.PerformanceViews.Template;
import org.ticketbox.catalog.performance.application.PerformanceViews.Venue;
import org.ticketbox.catalog.performance.domain.PerformanceLayout;
import org.ticketbox.catalog.performance.domain.PerformanceSale;

public interface PerformanceStore {
    Page<Event> events(UUID organizer, Pageable page);

    Page<DiscoveryCard> discover(DiscoveryQuery query, Pageable page);

    PerformanceViews.DiscoveryFacets discoveryFacets();

    Optional<Event> event(UUID id, UUID organizer);

    /** The event with every performance, drafts included; `organizer` null means any owner (platform preview). */
    Optional<Event> previewEvent(UUID id, UUID organizer);

    boolean ownsNativeEvent(UUID id, UUID organizer);

    Optional<Long> lockNativeEventVersion(UUID id, UUID organizer);

    boolean hasReleasedPerformances(UUID event);

    boolean hasPublicationReview(UUID performance);

    void createEvent(UUID id, UUID organizer, String title, String description);

    void updateDraftEvent(UUID id, String title, String description);

    /** Replaces the classification of an event; null clears it. Callers bump the content version. */
    void writeClassification(UUID eventId, EventClassification classification);

    /** The stored classification of an event, or null when there is none. */
    EventClassification classification(UUID eventId);

    /** The category of the event mapped to a legacy concert; `organizer` null means any owner. */
    Optional<ConcertCategory> legacyEventCategory(UUID concert, UUID organizer);

    /** Returns false when no such legacy concert is visible to the organizer. */
    boolean updateLegacyEventCategory(UUID concert, UUID organizer, EventClassification classification);

    List<Venue> venues(UUID organizer);

    Optional<Venue> venue(UUID id, UUID organizer);

    boolean ownsSpace(UUID id, UUID organizer);

    void createVenue(UUID id, UUID space, UUID organizer, String name, String address, String spaceName);

    Performance createPerformance(
            UUID id, UUID event, UUID space, OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors,
            String timezone, OffsetDateTime saleStart, OffsetDateTime saleEnd, int limit, boolean isPublic);

    Performance updateDraftSchedule(
            UUID id, UUID space, OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors,
            String timezone, OffsetDateTime saleStart, OffsetDateTime saleEnd, int limit, boolean isPublic);

    Optional<Performance> lockOwnedPerformance(UUID id, UUID organizer);

    Optional<Performance> publicPerformance(UUID id);

    Page<OperationsPerformance> operationsPerformances(String query, Pageable page);

    Optional<OperationsPerformance> operationsPerformance(UUID id);

    PerformanceSale sale(UUID id);

    void saveSale(UUID id, long version, PerformanceSale sale);

    Optional<Layout> draftLayout(UUID id);

    void saveDraftLayout(UUID id, long version, PerformanceLayout layout);

    String freezeLayout(UUID id, Layout draft);

    String layoutChecksum(UUID id, long version);

    Optional<LayoutOverview> layoutOverview(UUID id, long revision);

    Optional<LayoutSection> layoutSection(UUID id, long revision, UUID section);

    List<Template> templates(UUID venue, UUID organizer);

    Optional<Template> template(UUID id, UUID space, UUID organizer, long revision);

    Optional<Template> lockTemplate(UUID id, UUID venue, UUID organizer);

    Template createTemplate(UUID id, UUID organizer, UUID space, String name, PerformanceLayout layout);

    Template saveTemplate(Template current, PerformanceLayout layout);

    void storeBackground(UUID id, UUID owner, UUID performance, Background image);

    Optional<Background> draftBackground(UUID id, UUID performance, UUID owner);

    Optional<Background> publishedBackground(UUID id, UUID performance, long version);

    Publication publication(Performance performance);

    void savePublication(
            SaleSnapshot snapshot, UUID actor, Long publishedLayout, String status, boolean suspended);

    Optional<Performance> lockNativePerformance(UUID id);

    Optional<UUID> nativeOwner(UUID id);

    void changeTiming(UUID id, OffsetDateTime starts, OffsetDateTime ends, OffsetDateTime doors,
                      OffsetDateTime saleStart, OffsetDateTime saleEnd, OffsetDateTime resumedAdmissionAt);
}
