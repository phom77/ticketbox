package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.Upload;
import org.ticketbox.catalog.concert.application.port.PosterStorage;
import org.ticketbox.catalog.content.domain.ConcertText;
import org.ticketbox.catalog.performance.application.EventContentStore.Poster;
import org.ticketbox.catalog.performance.application.PerformanceViews.DiscoveryText;
import org.ticketbox.catalog.performance.application.PerformanceViews.Event;
import org.ticketbox.catalog.performance.domain.EventCategory;
import org.ticketbox.catalog.performance.domain.EventContent;
import org.ticketbox.catalog.performance.domain.EventContentRevision;
import org.ticketbox.catalog.performance.domain.EventContentRevision.Action;
import org.ticketbox.catalog.performance.domain.EventContentRevision.PosterEdit;
import org.ticketbox.catalog.performance.domain.EventContentRevision.State;

/**
 * Event content of native events: direct edits while no performance is released, then one reviewed revision per
 * event. Every write takes the event row lock first, so edits, submissions and decisions are serialized.
 */
@Service
public class EventContentService implements EventArtistBioPort {
    private final PerformanceStore store;
    private final EventContentStore contents;
    private final PosterStorage posters;
    private final PosterCleanup cleanup;
    private final PerformanceCatalog catalog;

    public EventContentService(PerformanceStore store, EventContentStore contents, PosterStorage posters,
                               PerformanceCatalog catalog) {
        this.store = store;
        this.contents = contents;
        this.posters = posters;
        this.catalog = catalog;
        this.cleanup = new PosterCleanup(posters);
    }

    /** What an organizer sends for the details step. */
    public record Input(String title, String description, String category, Map<String, ConcertText> translations,
                        String artistBio, String ageRating, String refundPolicy) {
        EventContent content() {
            return EventContent.authored(title, description, translations, artistBio, ageRating, refundPolicy);
        }
    }

    /** The live event and, for a released event, its pending revision. */
    public record ContentState(Event event, RevisionView revision) {}

    public record RevisionView(UUID eventId, long revision, State state, EventContent content, String posterUrl,
                               boolean posterChanged, String reason, OffsetDateTime submittedAt,
                               OffsetDateTime decidedAt) {}

    // Draft events

    @Transactional
    public Event create(UUID owner, Input input) {
        var content = input.content();
        String category = category(input.category());
        UUID id = UUID.randomUUID();
        store.createEvent(id, owner, content.title(), content.description(), category);
        contents.write(id, content);
        return store.event(id, owner).orElseThrow();
    }

    @Transactional
    public Event updateDraft(UUID owner, UUID id, Long expected, Input input) {
        long current = lock(owner, id);
        require(!store.hasReleasedPerformances(id), "error.performance.event-draft-locked");
        requireVersion(expected, current);
        var content = input.content();
        contents.writeCategory(id, category(input.category()));
        contents.write(id, content);
        return store.event(id, owner).orElseThrow();
    }

    // Poster

    @Transactional
    public ContentState replacePoster(UUID owner, UUID id, Long expectedVersion, Long expectedRevision, Upload file) {
        long current = lock(owner, id);
        var uploaded = posters.uploadEventPoster(id, file);
        cleanup.deleteOnRollback(uploaded.publicId());
        return changePoster(owner, id, current, expectedVersion, expectedRevision,
                new Poster(uploaded.secureUrl(), uploaded.publicId()));
    }

    @Transactional
    public ContentState removePoster(UUID owner, UUID id, Long expectedVersion, Long expectedRevision) {
        return changePoster(owner, id, lock(owner, id), expectedVersion, expectedRevision, new Poster(null, null));
    }

    private ContentState changePoster(UUID owner, UUID id, long current, Long expectedVersion, Long expectedRevision,
                                      Poster poster) {
        if (!store.hasReleasedPerformances(id)) {
            requireVersion(expectedVersion, current);
            var live = contents.live(id).orElseThrow(EventContentService::missing);
            contents.writePoster(id, poster);
            cleanup.deleteAfterCommit(live.poster().publicId());
            return new ContentState(store.event(id, owner).orElseThrow(), null);
        }
        var existing = contents.revision(id);
        checkRevision(expectedRevision, existing);
        var live = contents.live(id).orElseThrow(EventContentService::missing);
        var base = stagedContent(existing, live);
        if (existing.isPresent() && existing.get().state() != State.APPROVED && existing.get().poster().changed()) {
            cleanup.deleteAfterCommit(existing.get().poster().publicId());
        }
        var edit = new PosterEdit(true, poster.url(), poster.publicId());
        var next = existing.map(r -> r.edited(current, base, edit))
                .orElseGet(() -> EventContentRevision.start(id, current, base, edit));
        contents.save(next);
        return new ContentState(store.event(id, owner).orElseThrow(), view(next, live));
    }

    // Reviewed revision of a released event

    @Transactional
    public ContentState stage(UUID owner, UUID id, Long expectedRevision, Input input) {
        long current = lock(owner, id);
        require(store.hasReleasedPerformances(id), "error.event-content.not-released");
        var existing = contents.revision(id);
        checkRevision(expectedRevision, existing);
        var live = contents.live(id).orElseThrow(EventContentService::missing);
        var content = input.content();
        var poster = existing.filter(r -> r.state() != State.APPROVED).map(EventContentRevision::poster)
                .orElse(PosterEdit.unchanged());
        var next = existing.map(r -> r.edited(current, content, poster))
                .orElseGet(() -> EventContentRevision.start(id, current, content, poster));
        contents.save(next);
        return new ContentState(store.event(id, owner).orElseThrow(), view(next, live));
    }

    @Transactional(readOnly = true)
    public ContentState state(UUID owner, UUID id) {
        var event = store.event(id, owner).orElseThrow(EventContentService::missing);
        var live = contents.live(id);
        var revision = live.flatMap(value -> contents.revision(id).map(r -> view(r, value)));
        return new ContentState(event, revision.orElse(null));
    }

    @Transactional
    public ContentState submit(UUID owner, UUID actor, UUID id, Long expectedRevision) {
        lock(owner, id);
        var existing = contents.revision(id).orElseThrow(EventContentService::missing);
        checkRevision(expectedRevision, java.util.Optional.of(existing));
        var next = existing.submit(actor, OffsetDateTime.now());
        contents.save(next);
        contents.audit(actor, owner, "EVENT_CONTENT_SUBMITTED", id, "revision " + next.revision());
        return state(owner, id);
    }

    @Transactional
    public ContentState withdraw(UUID owner, UUID id) {
        lock(owner, id);
        var existing = contents.revision(id).orElseThrow(EventContentService::missing);
        contents.save(existing.withdraw());
        return state(owner, id);
    }

    @Transactional
    public ContentState discard(UUID owner, UUID id) {
        lock(owner, id);
        var existing = contents.revision(id).orElseThrow(EventContentService::missing);
        if (existing.state() == State.SUBMITTED) throw new AppException(ErrorCode.PERFORMANCE_VERSION_CONFLICT,
                "error.event-content.revision-in-review", existing.revision());
        if (existing.state() != State.APPROVED && existing.poster().changed()) {
            cleanup.deleteAfterCommit(existing.poster().publicId());
        }
        contents.deleteRevision(id);
        return state(owner, id);
    }

    // Platform review

    @Transactional(readOnly = true)
    public Page<EventContentStore.QueueRow> queue(State state, Pageable page) {
        return contents.queue(state == null ? State.SUBMITTED : state, page);
    }

    /** The live event and the revision side by side for a reviewer. */
    @Transactional(readOnly = true)
    public ContentState review(UUID id) {
        var event = store.previewEvent(id, null).orElseThrow(EventContentService::missing);
        var live = contents.live(id).orElseThrow(EventContentService::missing);
        var revision = contents.revision(id).orElseThrow(EventContentService::missing);
        return new ContentState(event, view(revision, live));
    }

    @Transactional
    public ContentState decide(UUID reviewer, UUID id, Action action, String reason, long expectedRevision) {
        // Performance rows first, then the event row: the same order as releasing a scheduled performance.
        contents.performanceIds(id);
        contents.lockEventNative(id).filter(Boolean::booleanValue).orElseThrow(EventContentService::missing);
        var revision = contents.revision(id).orElseThrow(EventContentService::missing);
        var decision = revision.decide(action, reviewer, reason, expectedRevision, OffsetDateTime.now());
        if (!decision.repeated()) {
            var decided = decision.revision();
            if (action == Action.APPROVE) {
                var live = contents.live(id).orElseThrow(EventContentService::missing);
                contents.apply(id, decided.content(), decided.poster());
                if (!live.content().title().equals(decided.content().title())) {
                    // The sale snapshot carries the event title: released performances get a new snapshot version.
                    catalog.republishReleased(contents.organization(id).orElseThrow(), reviewer, id);
                }
                if (decided.poster().changed() && live.poster().publicId() != null
                        && !live.poster().publicId().equals(decided.poster().publicId())) {
                    cleanup.deleteAfterCommit(live.poster().publicId());
                }
            }
            contents.save(decided);
            contents.audit(reviewer, contents.organization(id).orElse(null), "EVENT_CONTENT_" + action.name(), id,
                    "revision " + decided.revision());
        }
        return review(id);
    }

    // Preview

    /** The buyer view of an event, drafts included; `owner` null is the platform. */
    @Transactional(readOnly = true)
    public Event preview(UUID owner, UUID id, boolean staged) {
        var event = store.previewEvent(id, owner).orElseThrow(EventContentService::missing);
        if (!staged) return event;
        return contents.revision(id).filter(r -> r.state() != State.APPROVED)
                .map(r -> overlay(event, r)).orElse(event);
    }

    static Event overlay(Event event, EventContentRevision revision) {
        var content = revision.content();
        var translations = new LinkedHashMap<String, DiscoveryText>();
        content.translations().forEach((language, text) ->
                translations.put(language, new DiscoveryText(text.title(), text.description())));
        return new Event(event.id(), content.title(), content.description(), event.category(), event.draftVersion(),
                event.contentVersion(),
                event.performances(), revision.poster().changed() ? revision.poster().url() : event.posterUrl(),
                translations, content.artistBio(), content.ageRating(), content.refundPolicy());
    }

    // Artist bio generation

    @Override
    @Transactional(readOnly = true)
    public EventBioView requireAccessibleEvent(UUID eventId, UUID requesterId, boolean admin) {
        var owner = contents.organization(eventId).orElseThrow(EventContentService::missing);
        if (!admin && !owner.equals(requesterId)) throw missing();
        return requireEvent(eventId);
    }

    @Override
    @Transactional(readOnly = true)
    public EventBioView requireEvent(UUID eventId) {
        var live = contents.live(eventId).orElseThrow(EventContentService::missing);
        return new EventBioView(eventId, live.content().title(), live.content().artistBio());
    }

    @Override
    @Transactional
    public void applyArtistBio(UUID eventId, String artistBio, UUID requesterId, boolean admin, boolean overwrite) {
        var owner = contents.organization(eventId).orElseThrow(EventContentService::missing);
        if (!admin && !owner.equals(requesterId)) throw missing();
        long current = lock(owner, eventId);
        var live = contents.live(eventId).orElseThrow(EventContentService::missing);
        boolean released = store.hasReleasedPerformances(eventId);
        var existing = released ? contents.revision(eventId) : java.util.Optional.<EventContentRevision>empty();
        var base = released ? stagedContent(existing, live) : live.content();
        if (!overwrite && base.artistBio() != null && !base.artistBio().isBlank()) {
            throw new AppException(ErrorCode.ARTIST_BIO_ALREADY_EXISTS, "error.artist-bio.overwrite-required");
        }
        var updated = EventContent.authored(base.title(), base.description(), base.translations(), artistBio,
                base.ageRating(), base.refundPolicy());
        if (!released) {
            contents.write(eventId, updated);
            return;
        }
        var poster = existing.filter(r -> r.state() != State.APPROVED).map(EventContentRevision::poster)
                .orElse(PosterEdit.unchanged());
        var next = existing.map(r -> r.edited(current, updated, poster))
                .orElseGet(() -> EventContentRevision.start(eventId, current, updated, poster));
        contents.save(next);
    }

    // Helpers

    private long lock(UUID owner, UUID id) {
        return contents.lockContentVersion(id, owner).orElseThrow(EventContentService::missing);
    }

    /** The content an edit starts from: the open revision, or the live content when there is none to continue. */
    private static EventContent stagedContent(java.util.Optional<EventContentRevision> existing,
                                              EventContentStore.Live live) {
        return existing.filter(r -> r.state() != State.APPROVED).map(EventContentRevision::content)
                .orElse(live.content());
    }

    private static RevisionView view(EventContentRevision revision, EventContentStore.Live live) {
        return new RevisionView(revision.eventId(), revision.revision(), revision.state(), revision.content(),
                revision.poster().changed() ? revision.poster().url() : live.poster().url(),
                revision.poster().changed(), revision.reason(), revision.submittedAt(), revision.decidedAt());
    }

    private static void checkRevision(Long expected, java.util.Optional<EventContentRevision> existing) {
        require(expected != null, "error.event-content.expected-revision");
        version(expected, existing.map(EventContentRevision::revision).orElse(0L));
    }

    private static String category(String category) {
        if (category == null || category.isBlank()) return null;
        return EventCategory.parse(category.strip()).map(EventCategory::id)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST, "error.performance.invalid-category"));
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }

    private static void require(boolean condition, String key) {
        if (!condition) throw new AppException(ErrorCode.INVALID_REQUEST, key);
    }

    private static void requireVersion(Long expected, long actual) {
        require(expected != null, "error.performance.expected-draft-version");
        version(expected, actual);
    }

    private static void version(long expected, long actual) {
        if (expected != actual) throw new AppException(ErrorCode.PERFORMANCE_VERSION_CONFLICT,
                "error.performance.version-conflict", actual);
    }
}
