package org.ticketbox.catalog.concert.application.dto;

import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.concert.application.port.ConcertPublicationStore.Review;

import java.util.List;

public record SalePublication(Concert.Status status, List<String> issues, Versions versions, Review review, boolean draftEdit) {
    public SalePublication(Concert.Status status, List<String> issues, Versions versions) {
        this(status, issues, versions, null, false);
    }
    public record Versions(long version, Long activationVersion, long ticketingVersion, long checkinVersion) {}
}
