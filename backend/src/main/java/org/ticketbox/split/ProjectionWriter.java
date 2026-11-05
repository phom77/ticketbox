package org.ticketbox.split;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/** Copies allowlisted, complete source rows into a service-owned read projection. */
public class ProjectionWriter {
    private static final Set<String> TABLES = Set.of("concerts", "ticket_types", "tickets");
    private final JdbcTemplate jdbc;

    public ProjectionWriter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsert(String table, JsonNode row, Set<String> preserveOnUpdate) {
        if (!TABLES.contains(table)) throw new IllegalArgumentException("Unsupported projection");
        List<String> columns = jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema='public' AND table_name=? ORDER BY ordinal_position
                """, String.class, table);
        if (columns.stream().anyMatch(c -> !row.has(c))) {
            throw new IllegalArgumentException("Incomplete " + table + " projection");
        }
        String names = String.join(",", columns);
        String updates = columns.stream().filter(c -> !c.equals("id") && !preserveOnUpdate.contains(c))
                .map(c -> c + "=EXCLUDED." + c).collect(Collectors.joining(","));
        jdbc.update("INSERT INTO " + table + " (" + names + ") SELECT " + names
                + " FROM jsonb_populate_record(NULL::" + table + ",CAST(? AS jsonb))"
                + " ON CONFLICT(id) DO UPDATE SET " + updates, row.toString());
    }
}
