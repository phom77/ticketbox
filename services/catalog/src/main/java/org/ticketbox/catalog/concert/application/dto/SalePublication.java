package org.ticketbox.catalog.concert.application.dto;

import org.ticketbox.catalog.concert.domain.Concert;

import java.util.List;

public record SalePublication(Concert.Status status, List<String> issues, Versions versions) {
    public record Versions(long version, Long activationVersion, long ticketingVersion, long checkinVersion) {}
}
