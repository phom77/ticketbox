package org.ticketbox.catalog.performance.domain;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.ticketbox.catalog.content.domain.ConcertContent;
import org.ticketbox.catalog.content.domain.ConcertText;
import org.ticketbox.catalog.domain.DomainViolation;

/**
 * What buyers read about a native event besides its schedule: the original title and description, translations,
 * artist bio, age rating and refund policy. Values are normalized (blank becomes absent) and validated on creation.
 */
public record EventContent(String title, String description, Map<String, ConcertText> translations,
                           String artistBio, String ageRating, String refundPolicy) {
    public static final Set<String> AGE_RATINGS = Set.of("ALL", "13+", "16+", "18+");
    public static final int MAX_TITLE = 500;
    public static final int MAX_DESCRIPTION = 60_000;
    public static final int MAX_BIO = 20_000;
    public static final int MAX_REFUND_POLICY = 2_000;

    public EventContent {
        translations = translations == null ? Map.of() : Map.copyOf(translations);
    }

    public static EventContent authored(String title, String description, Map<String, ConcertText> translations,
                                        String artistBio, String ageRating, String refundPolicy) {
        if (title == null || title.isBlank() || title.strip().length() > MAX_TITLE) {
            throw invalid("error.performance.invalid-event");
        }
        String original = blankToNull(description);
        if (original != null && description.length() > MAX_DESCRIPTION) throw invalid("error.performance.invalid-event");
        var cleaned = new HashMap<String, ConcertText>();
        // ConcertContent owns the supported languages and the per-text rules.
        new ConcertContent(null, Map.of()).update(null, translations == null ? Map.of() : translations)
                .translations().forEach((language, text) -> {
                    if (text.description() != null && text.description().length() > MAX_DESCRIPTION) {
                        throw invalid("error.performance.invalid-event");
                    }
                    cleaned.put(language, text);
                });
        String bio = blankToNull(artistBio);
        if (bio != null && bio.length() > MAX_BIO) throw invalid("error.event-content.invalid-bio");
        String rating = blankToNull(ageRating);
        if (rating != null && !AGE_RATINGS.contains(rating)) throw invalid("error.event-content.invalid-age-rating");
        String refund = blankToNull(refundPolicy);
        if (refund != null && refund.length() > MAX_REFUND_POLICY) throw invalid("error.event-content.invalid-refund-policy");
        return new EventContent(title.strip(), description, cleaned, bio, rating, refund);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static DomainViolation invalid(String key) {
        return new DomainViolation("VALIDATION_FAILED", key);
    }
}
