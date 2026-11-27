package org.ticketbox.catalog.performance.application;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.ticketbox.catalog.concert.application.port.PosterStorage;

/** Removes poster assets that a transaction replaced (after commit) or uploaded and then rolled back. */
class PosterCleanup {
    private final PosterStorage storage;

    PosterCleanup(PosterStorage storage) {
        this.storage = storage;
    }

    void deleteAfterCommit(String publicId) {
        if (publicId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            storage.deleteBestEffort(publicId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                storage.deleteBestEffort(publicId);
            }
        });
    }

    void deleteOnRollback(String publicId) {
        if (publicId == null || !TransactionSynchronizationManager.isSynchronizationActive()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) storage.deleteBestEffort(publicId);
            }
        });
    }
}