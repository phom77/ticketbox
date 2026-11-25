package org.ticketbox.catalog.performance.domain;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/** The fixed categories an event can have. The ids are stored in `events.category` and shown translated by the web app. */
public enum EventCategory {
    CONCERTS("concerts"),
    FESTIVALS("festivals"),
    SPORTS("sports"),
    ARTS_THEATER("arts-theater"),
    COMEDY("comedy"),
    FAMILY("family");

    private final String id;

    EventCategory(String id) {
        this.id = id;
    }

    public String id() {
        return id;
    }

    public static List<String> ids() {
        return Arrays.stream(values()).map(EventCategory::id).toList();
    }

    /** The category with exactly this id, or empty for anything else. */
    public static Optional<EventCategory> parse(String value) {
        return Arrays.stream(values()).filter(category -> category.id.equals(value)).findFirst();
    }
}
