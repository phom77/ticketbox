package org.ticketbox.catalog.classification.domain;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The segments and genres Catalog knows, as loaded from reference data. Inactive rows stay in the reference so events
 * that already use them keep displaying; only new assignments are refused.
 */
public final class ClassificationReference {
    public record Genre(String id, String segmentId, int sort, boolean popular, boolean active) {}

    public record Segment(String id, int sort, boolean active, List<Genre> genres) {
        public Segment {
            genres = List.copyOf(genres);
        }
    }

    private final List<Segment> segments;
    private final Map<String, Segment> segmentsById;
    private final Map<String, Genre> genresById;

    public ClassificationReference(List<Segment> segments) {
        this.segments = List.copyOf(segments);
        var bySegment = new java.util.LinkedHashMap<String, Segment>();
        var byGenre = new java.util.LinkedHashMap<String, Genre>();
        for (Segment segment : segments) {
            bySegment.put(segment.id(), segment);
            segment.genres().forEach(genre -> byGenre.put(genre.id(), genre));
        }
        segmentsById = Map.copyOf(bySegment);
        genresById = Map.copyOf(byGenre);
    }

    public List<Segment> segments() {
        return segments;
    }

    public Optional<Segment> segment(String id) {
        return Optional.ofNullable(segmentsById.get(id));
    }

    public Optional<Genre> genre(String id) {
        return Optional.ofNullable(genresById.get(id));
    }

    /** The active segments with their active genres, in display order. */
    public List<Segment> active() {
        return segments.stream().filter(Segment::active)
                .map(segment -> new Segment(segment.id(), segment.sort(), true,
                        segment.genres().stream().filter(Genre::active).toList()))
                .toList();
    }
}
