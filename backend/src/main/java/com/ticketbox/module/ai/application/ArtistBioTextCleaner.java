package com.ticketbox.module.ai.application;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class ArtistBioTextCleaner {

    public String clean(String input, int maxCharacters) {
        if (input == null || input.isBlank()) {
            return "";
        }

        String normalized = Normalizer.normalize(input, Normalizer.Form.NFC)
                .replace("\u0000", "")
                .replace("\r\n", "\n")
                .replace('\r', '\n')
                .replaceAll("[\\p{Cc}&&[^\\n\\t]]", "");

        List<String> lines = Arrays.stream(normalized.split("\\n", -1))
                .map(line -> line.replace('\t', ' ').replaceAll("[ ]+", " ").trim())
                .toList();
        Map<String, Integer> frequencies = countNonBlankLines(lines);

        List<String> kept = new ArrayList<>();
        for (String line : lines) {
            if (!line.isBlank() && isRepeatedHeaderOrFooter(line, frequencies)) {
                continue;
            }
            kept.add(line);
        }

        String cleaned = String.join("\n", kept)
                .replaceAll("(?<=\\p{L})-\\n(?=\\p{Ll})", "")
                .replaceAll("(?<!\\n)\\n(?!\\n)", " ")
                .replaceAll("[ ]+", " ")
                .replaceAll(" *\\n *", "\n")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();

        if (cleaned.length() <= maxCharacters) {
            return cleaned;
        }
        return cleaned.substring(0, maxCharacters).trim();
    }

    public String sanitizeGeneratedBio(String bio) {
        if (bio == null) {
            return "";
        }
        return Normalizer.normalize(bio, Normalizer.Form.NFC)
                .replaceAll("(?s)<[^>]*>", "")
                .replaceAll("(?m)^```.*$", "")
                .replace("```", "")
                .replaceAll("[\\p{Cc}&&[^\\n\\t]]", "")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\\n{3,}", "\n\n")
                .trim();
    }

    private Map<String, Integer> countNonBlankLines(List<String> lines) {
        Map<String, Integer> frequencies = new LinkedHashMap<>();
        for (String line : lines) {
            if (!line.isBlank()) {
                String key = line.toLowerCase(Locale.ROOT);
                frequencies.merge(key, 1, Integer::sum);
            }
        }
        return frequencies;
    }

    private boolean isRepeatedHeaderOrFooter(
            String line,
            Map<String, Integer> frequencies) {
        if (line.length() > 120) {
            return false;
        }
        return frequencies.getOrDefault(line.toLowerCase(Locale.ROOT), 0) >= 3;
    }
}
