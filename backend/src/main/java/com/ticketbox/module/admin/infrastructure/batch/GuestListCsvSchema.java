package com.ticketbox.module.admin.infrastructure.batch;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.apache.commons.csv.CSVRecord;

/** Canonical TicketBox CSV fields and the common partner-export aliases accepted for them. */
final class GuestListCsvSchema {

    private static final Map<String, Set<String>> REQUIRED_HEADER_ALIASES = requiredAliases();
    private static final Map<String, Set<String>> OPTIONAL_HEADER_ALIASES = Map.of(
            "status", Set.of("status", "guest_status"));

    private GuestListCsvSchema() {
    }

    static Set<String> missingRequiredHeaders(Set<String> rawHeaders) {
        Set<String> normalizedHeaders = new LinkedHashSet<>();
        rawHeaders.forEach(header -> normalizedHeaders.add(normalize(header)));

        Set<String> missing = new LinkedHashSet<>();
        REQUIRED_HEADER_ALIASES.forEach((canonical, aliases) -> {
            if (aliases.stream().map(GuestListCsvSchema::normalize).noneMatch(normalizedHeaders::contains)) {
                missing.add(canonical);
            }
        });
        return missing;
    }

    static String value(CSVRecord record, String canonicalHeader) {
        Set<String> aliases = REQUIRED_HEADER_ALIASES.get(canonicalHeader);
        if (aliases == null) {
            aliases = OPTIONAL_HEADER_ALIASES.getOrDefault(canonicalHeader, Set.of(canonicalHeader));
        }

        for (Map.Entry<String, String> entry : record.toMap().entrySet()) {
            String normalizedHeader = normalize(entry.getKey());
            if (aliases.stream().map(GuestListCsvSchema::normalize).anyMatch(normalizedHeader::equals)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static Map<String, Set<String>> requiredAliases() {
        Map<String, Set<String>> aliases = new LinkedHashMap<>();
        aliases.put("phone", Set.of("phone", "phone_number", "mobile"));
        aliases.put("full_name", Set.of("full_name", "name", "guest_name"));
        aliases.put("category", Set.of("category", "guest_type", "guest_category"));
        aliases.put("sponsor_name", Set.of("sponsor_name", "sponsor"));
        aliases.put("notes", Set.of("notes", "note"));
        return Map.copyOf(aliases);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replace("\uFEFF", "").trim().toLowerCase(Locale.ROOT);
    }
}
