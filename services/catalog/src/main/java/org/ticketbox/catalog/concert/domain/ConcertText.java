package org.ticketbox.catalog.concert.domain;

import org.ticketbox.catalog.domain.DomainViolation;

public record ConcertText(String title, String description) {
    public static ConcertText authored(String title, String description) {
        title = normalize(title);
        if (title != null && title.length() > 500) {
            throw new DomainViolation("VALIDATION_FAILED", "validation.concert.title-length");
        }
        return new ConcertText(title, normalize(description));
    }

    boolean isEmpty() {
        return title == null && description == null;
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
