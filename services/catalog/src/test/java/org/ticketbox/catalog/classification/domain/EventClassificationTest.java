package org.ticketbox.catalog.classification.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.ticketbox.catalog.classification.domain.ClassificationReference.Genre;
import org.ticketbox.catalog.classification.domain.ClassificationReference.Segment;
import org.ticketbox.catalog.domain.DomainViolation;

class EventClassificationTest {
    private static final ClassificationReference REFERENCE = new ClassificationReference(List.of(
            new Segment("concerts", 1, true, List.of(new Genre("vpop", "concerts", 1, true, true),
                    new Genre("rock", "concerts", 2, true, true), new Genre("edm", "concerts", 3, false, true),
                    new Genre("jazz", "concerts", 4, false, true), new Genre("kpop", "concerts", 5, false, true),
                    new Genre("old-wave", "concerts", 6, false, false))),
            new Segment("sports", 2, true, List.of(new Genre("football", "sports", 1, true, true))),
            new Segment("retired", 3, false, List.of())));

    private static EventClassification of(String segment, String primary, List<String> tags) {
        return EventClassification.of(segment, primary, tags, REFERENCE, null);
    }

    @Test
    void acceptsNothingASegmentOnlyAndAFullClassification() {
        assertThat(of(null, null, null)).isNull();
        assertThat(of(" ", "", List.of(" "))).isNull();
        assertThat(of("concerts", null, null)).isEqualTo(new EventClassification("concerts", null, List.of()));
        var full = of("concerts", "vpop", List.of("rock", "football"));
        assertThat(full.secondaryGenres()).containsExactly("rock", "football");
        assertThat(EventClassification.releasable(full)).isTrue();
        assertThat(EventClassification.releasable(of("concerts", null, null))).isFalse();
        assertThat(EventClassification.releasable(null)).isFalse();
    }

    @Test
    void rejectsEveryInvalidCombinationWithATranslatableKey() {
        assertRejected("error.classification.unknown-segment", () -> of("opera", null, null));
        assertRejected("error.classification.unknown-segment", () -> of("Concerts", null, null));
        assertRejected("error.classification.genre-outside-segment", () -> of("sports", "vpop", null));
        assertRejected("error.classification.genre-outside-segment", () -> of(null, "vpop", null));
        assertRejected("error.classification.unknown-genre", () -> of("concerts", "bogus", null));
        assertRejected("error.classification.unknown-genre", () -> of("concerts", "vpop", List.of("bogus")));
        assertRejected("error.classification.unknown-genre", () -> of("concerts", "vpop", List.of("vpop")));
        assertRejected("error.classification.unknown-genre", () -> of("concerts", "vpop", List.of("rock", "rock")));
        assertRejected("error.classification.too-many-tags",
                () -> of("concerts", "vpop", List.of("rock", "edm", "jazz", "football")));
        assertThat(of("concerts", "vpop", List.of("rock", "edm", "jazz")).secondaryGenres()).hasSize(3);
    }

    @Test
    void refusesNewInactiveIdsButAcceptsUnchangedOnes() {
        assertRejected("error.classification.inactive-genre", () -> of("concerts", "old-wave", null));
        assertRejected("error.classification.inactive-genre", () -> of("concerts", "vpop", List.of("old-wave")));
        assertRejected("error.classification.inactive-genre", () -> of("retired", null, null));
        var current = new EventClassification("concerts", "old-wave", List.of());
        assertThat(EventClassification.of("concerts", "old-wave", List.of("rock"), REFERENCE, current).primaryGenre())
                .isEqualTo("old-wave");
        var tagged = new EventClassification("concerts", "vpop", List.of("old-wave"));
        assertThat(EventClassification.of("concerts", "vpop", List.of("old-wave", "rock"), REFERENCE, tagged)
                .secondaryGenres()).containsExactly("old-wave", "rock");
    }

    @Test
    void mapsOldCategoriesAndDetectsSnapshotChanges() {
        assertThat(EventClassification.fromLegacyCategory("arts-theater").segment()).isEqualTo("arts-theater-comedy");
        var comedy = EventClassification.fromLegacyCategory("Comedy");
        assertThat(comedy.segment()).isEqualTo("arts-theater-comedy");
        assertThat(comedy.primaryGenre()).isEqualTo("stand-up");
        assertThat(EventClassification.fromLegacyCategory("opera-gala")).isNull();
        assertThat(EventClassification.fromLegacyCategory(null)).isNull();
        var base = new EventClassification("concerts", "vpop", List.of("rock"));
        assertThat(EventClassification.snapshotChanged(base, new EventClassification("concerts", "vpop", List.of()))).isFalse();
        assertThat(EventClassification.snapshotChanged(base, new EventClassification("concerts", "rock", List.of()))).isTrue();
        assertThat(EventClassification.snapshotChanged(null, base)).isTrue();
        assertThat(EventClassification.snapshotChanged(null, null)).isFalse();
    }

    private static void assertRejected(String key, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOf(DomainViolation.class).hasMessage(key);
    }
}
