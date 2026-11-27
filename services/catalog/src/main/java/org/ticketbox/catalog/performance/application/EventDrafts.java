package org.ticketbox.catalog.performance.application;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.concert.application.port.PosterStorage;
import org.ticketbox.catalog.performance.application.PerformanceViews.Performance;

/**
 * Deletes drafts. A performance is deletable while it is DRAFT, was never released and is not under review. An event
 * is deletable when it is native and all of its performances are. Shared backgrounds and templates are kept.
 */
@Service
public class EventDrafts {
    private final PerformanceStore store;
    private final EventContentStore contents;
    private final PosterCleanup posters;
    private final EventBioCleanup bioCleanup;

    public EventDrafts(PerformanceStore store, EventContentStore contents, PosterStorage posters,
                       EventBioCleanup bioCleanup) {
        this.store = store;
        this.contents = contents;
        this.posters = new PosterCleanup(posters);
        this.bioCleanup = bioCleanup;
    }

    @Transactional
    public void deletePerformance(UUID owner, UUID actor, UUID id, Long expectedDraftVersion) {
        var performance = store.lockOwnedPerformance(id, owner).orElseThrow(EventDrafts::missing);
        requireVersion(expectedDraftVersion, performance.draftVersion());
        requireDeletable(performance);
        contents.deletePerformance(id);
        contents.audit(actor, owner, "DRAFT_PERFORMANCE_DELETED", id, "event " + performance.eventId());
    }

    @Transactional
    public void deleteEvent(UUID owner, UUID actor, UUID id, Long expectedDraftVersion) {
        long version = store.lockNativeEventVersion(id, owner).orElseThrow(EventDrafts::missing);
        requireVersion(expectedDraftVersion, version);
        for (UUID performanceId : contents.performanceIds(id)) {
            requireDeletable(store.lockOwnedPerformance(performanceId, owner).orElseThrow(EventDrafts::missing));
        }
        List<String> posterIds = contents.storedPosterIds(id);
        Runnable removeDocuments = bioCleanup.documentsRemoval(id);
        contents.deleteEvent(id);
        contents.audit(actor, owner, "DRAFT_EVENT_DELETED", id, null);
        posterIds.forEach(posters::deleteAfterCommit);
        afterCommit(removeDocuments);
    }

    private void requireDeletable(Performance performance) {
        if (!"DRAFT".equals(performance.status()) || contents.releasedOrInReview(performance.id())) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.not-deletable");
        }
    }

    private static void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }

    private static void requireVersion(Long expected, long actual) {
        if (expected == null) throw new AppException(ErrorCode.INVALID_REQUEST, "error.performance.expected-draft-version");
        if (expected != actual) throw new AppException(ErrorCode.PERFORMANCE_VERSION_CONFLICT,
                "error.performance.version-conflict", actual);
    }

    private static AppException missing() {
        return new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.performance.not-found");
    }
}
