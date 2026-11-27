package org.ticketbox.catalog.classification.application;

import org.ticketbox.catalog.classification.domain.ClassificationReference;

/** Reads the segment and genre reference data. */
public interface ClassificationStore {
    ClassificationReference load();
}
