package org.ticketbox.catalog.classification.infrastructure;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.ticketbox.catalog.classification.application.ClassificationStore;
import org.ticketbox.catalog.classification.domain.ClassificationReference;
import org.ticketbox.catalog.classification.domain.ClassificationReference.Genre;
import org.ticketbox.catalog.classification.domain.ClassificationReference.Segment;

@Repository
public class JdbcClassificationStore implements ClassificationStore {
    private final JdbcTemplate jdbc;

    public JdbcClassificationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public ClassificationReference load() {
        var genres = new LinkedHashMap<String, List<Genre>>();
        jdbc.query("SELECT id, segment_id, sort, popular, active FROM classification_genres ORDER BY sort, id", rs -> {
            genres.computeIfAbsent(rs.getString("segment_id"), key -> new ArrayList<>()).add(new Genre(
                    rs.getString("id"), rs.getString("segment_id"), rs.getInt("sort"), rs.getBoolean("popular"),
                    rs.getBoolean("active")));
        });
        var segments = jdbc.query("SELECT id, sort, active FROM classification_segments ORDER BY sort, id",
                (rs, n) -> new Segment(rs.getString("id"), rs.getInt("sort"), rs.getBoolean("active"),
                        genres.getOrDefault(rs.getString("id"), List.of())));
        return new ClassificationReference(segments);
    }
}
