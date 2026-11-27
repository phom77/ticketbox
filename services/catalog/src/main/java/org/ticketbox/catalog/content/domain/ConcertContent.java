package org.ticketbox.catalog.content.domain;

import org.ticketbox.catalog.domain.DomainViolation;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

public record ConcertContent(ConcertText original, Map<String, ConcertText> translations) {
    private static final List<String> LANGUAGES = List.of("vi", "en");

    public ConcertContent {
        translations = Map.copyOf(translations);
    }

    public ConcertContent update(ConcertText originalEdit, Map<String, ConcertText> translationEdits) {
        var updated = new HashMap<>(translations);
        if (translationEdits != null) {
            translationEdits.forEach((language, edit) -> {
                if (!LANGUAGES.contains(language)) {
                    throw new DomainViolation("VALIDATION_FAILED", "validation.concert.translation-language");
                }
                ConcertText text = edit == null ? null : ConcertText.authored(edit.title(), edit.description());
                if (text == null || text.hasNoText()) updated.remove(language);
                else updated.put(language, text);
            });
        }
        ConcertText source = originalEdit == null
                ? original
                : ConcertText.authored(originalEdit.title(), originalEdit.description());
        return new ConcertContent(source == null || source.hasNoText() ? null : source, updated);
    }

    public String compatibilityText(Function<ConcertText, String> field) {
        String value = original == null ? null : field.apply(original);
        if (value != null) return value;
        for (String language : LANGUAGES) {
            ConcertText text = translations.get(language);
            if (text != null && field.apply(text) != null) return field.apply(text);
        }
        return null;
    }
}
