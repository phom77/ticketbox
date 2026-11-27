package org.ticketbox.catalog.classification.domain;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.ticketbox.catalog.domain.DomainViolation;

/**
 * How an event is classified: one segment, one primary genre inside that segment and up to three secondary genres
 * (tags) from any segment. A draft may be unclassified, hold a segment only, or hold a full classification.
 */
public record EventClassification(String segment, String primaryGenre, List<String> secondaryGenres) {
    public static final int MAX_TAGS = 3;
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    /**
     * The old fixed category ids and the segment (and genre) each one maps to. Segment ids map to themselves, so the
     * legacy-concert category endpoints accept what the pickers send.
     */
    private static final Map<String, EventClassification> LEGACY = Map.of(
            "concerts", new EventClassification("concerts", null, List.of()),
            "festivals", new EventClassification("festivals", null, List.of()),
            "sports", new EventClassification("sports", null, List.of()),
            "arts-theater", new EventClassification("arts-theater-comedy", null, List.of()),
            "comedy", new EventClassification("arts-theater-comedy", "stand-up", List.of()),
            "family", new EventClassification("family", null, List.of()),
            "arts-theater-comedy", new EventClassification("arts-theater-comedy", null, List.of()),
            "other", new EventClassification("other", null, List.of()));

    public EventClassification {
        secondaryGenres = secondaryGenres == null ? List.of() : List.copyOf(secondaryGenres);
    }

    /** The classification for an old category id, or null when the id was never a category. */
    public static EventClassification fromLegacyCategory(String category) {
        return category == null ? null : LEGACY.get(category.strip().toLowerCase(java.util.Locale.ROOT));
    }

    /**
     * Validates a requested classification against the reference data. Every id that is new compared with
     * `current` (which may be null) must be active; an unchanged inactive id is accepted. Returns null when nothing
     * was chosen.
     */
    public static EventClassification of(String segment, String primaryGenre, List<String> secondaryGenres,
                                         ClassificationReference reference, EventClassification current) {
        String segmentId = blankToNull(segment);
        String primary = blankToNull(primaryGenre);
        var tags = new ArrayList<String>();
        if (secondaryGenres != null) secondaryGenres.stream().map(EventClassification::blankToNull)
                .filter(java.util.Objects::nonNull).forEach(tags::add);
        if (segmentId == null && primary == null && tags.isEmpty()) return null;
        var distinct = new LinkedHashSet<>(tags);
        if (distinct.size() != tags.size()) throw invalid("error.classification.unknown-genre");
        if (distinct.size() > MAX_TAGS) throw invalid("error.classification.too-many-tags");
        if (segmentId == null) throw invalid(primary == null ? "error.classification.unknown-segment"
                : "error.classification.genre-outside-segment");
        if (!SLUG.matcher(segmentId).matches() || reference.segment(segmentId).isEmpty()) {
            throw invalid("error.classification.unknown-segment");
        }
        var segmentRow = reference.segment(segmentId).orElseThrow();
        boolean segmentChanged = current == null || !segmentId.equals(current.segment());
        if (segmentChanged && !segmentRow.active()) throw invalid("error.classification.inactive-genre");
        if (primary != null) {
            var genre = known(primary, reference);
            if (!genre.segmentId().equals(segmentId)) throw invalid("error.classification.genre-outside-segment");
            if (!genre.active() && (current == null || !primary.equals(current.primaryGenre()))) {
                throw invalid("error.classification.inactive-genre");
            }
            if (distinct.contains(primary)) throw invalid("error.classification.unknown-genre");
        }
        for (String tag : distinct) {
            var genre = known(tag, reference);
            if (!genre.active() && (current == null || !current.secondaryGenres().contains(tag))) {
                throw invalid("error.classification.inactive-genre");
            }
        }
        return new EventClassification(segmentId, primary, List.copyOf(distinct));
    }

    /** True when a performance of the event may be submitted for release. */
    public static boolean releasable(EventClassification classification) {
        return classification != null && classification.segment() != null && classification.primaryGenre() != null;
    }

    /** True when the segment or primary genre differs: the values the sale snapshot carries. */
    public static boolean snapshotChanged(EventClassification before, EventClassification after) {
        return !java.util.Objects.equals(before == null ? null : before.segment(), after == null ? null : after.segment())
                || !java.util.Objects.equals(before == null ? null : before.primaryGenre(),
                after == null ? null : after.primaryGenre());
    }

    private static ClassificationReference.Genre known(String id, ClassificationReference reference) {
        if (!SLUG.matcher(id).matches()) throw invalid("error.classification.unknown-genre");
        return reference.genre(id).orElseThrow(() -> invalid("error.classification.unknown-genre"));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static DomainViolation invalid(String key) {
        return new DomainViolation("VALIDATION_FAILED", key);
    }
}
