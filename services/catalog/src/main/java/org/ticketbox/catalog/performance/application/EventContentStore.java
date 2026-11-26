package org.ticketbox.catalog.performance.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.ticketbox.catalog.performance.domain.EventContent;
import org.ticketbox.catalog.performance.domain.EventContentRevision;
import org.ticketbox.catalog.performance.domain.EventContentRevision.PosterEdit;

/** Persistence of native event content, its pending revision and draft deletion. */
public interface EventContentStore {
    record Poster(String url, String publicId) {}

    /** The live content of a native event. */
    record Live(EventContent content, Poster poster, long draftVersion) {}

    record QueueRow(UUID eventId, UUID organizationId, String title, EventContentRevision.State state, long revision,
                    OffsetDateTime submittedAt, String reason) {}

    Optional<Live> live(UUID eventId);

    /** Sets the category without bumping the draft version; callers bump it with the content write. */
    void writeCategory(UUID eventId, String category);

    /** Writes the draft content and bumps the draft version. */
    void write(UUID eventId, EventContent content);

    /** Replaces or removes the poster and bumps the draft version. */
    void writePoster(UUID eventId, Poster poster);

    /** Applies approved content under the caller's event lock and bumps the draft version. */
    void apply(UUID eventId, EventContent content, PosterEdit poster);

    Optional<EventContentRevision> revision(UUID eventId);

    void save(EventContentRevision revision);

    void deleteRevision(UUID eventId);

    Page<QueueRow> queue(EventContentRevision.State state, Pageable page);

    Optional<UUID> organization(UUID eventId);

    /** Locks the event row and returns its organization and whether it is a native event. */
    Optional<Boolean> lockEventNative(UUID eventId);

    /** True when the performance has a review that blocks deletion or was ever released. */
    boolean releasedOrInReview(UUID performanceId);

    List<UUID> performanceIds(UUID eventId);

    /** The poster public ids of the event and of its staged revision, and the stored PDF paths of its bio jobs. */
    List<String> storedPosterIds(UUID eventId);

    List<String> artistPdfPaths(UUID eventId);

    void deletePerformance(UUID id);

    void deleteEvent(UUID id);

    void audit(UUID actor, UUID organization, String action, UUID subject, String details);
}
