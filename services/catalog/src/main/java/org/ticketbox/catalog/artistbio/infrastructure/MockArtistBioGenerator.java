package org.ticketbox.catalog.artistbio.infrastructure;

import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.artistbio.application.ArtistBioGenerationRequest;
import org.ticketbox.catalog.artistbio.application.ArtistBioGenerationResult;
import org.ticketbox.catalog.artistbio.application.ArtistBioGenerator;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class MockArtistBioGenerator implements ArtistBioGenerator {
    private final MessageSource messages;

    public MockArtistBioGenerator(MessageSource messages) {
        this.messages = messages;
    }

    @Override
    public String provider() {
        return "mock";
    }

    @Override
    public String model() {
        return "local-deterministic";
    }

    @Override
    public ArtistBioGenerationResult generate(ArtistBioGenerationRequest request) {
        Locale locale =
                "Vietnamese".equalsIgnoreCase(request.language())
                        ? Locale.forLanguageTag("vi")
                        : Locale.forLanguageTag(request.language());
        if (request.sourceText() != null
                && request.sourceText().contains("Composition mode: MULTI_ARTIST")) {
            Set<String> artists = detectedArtists(request.sourceText());
            if (artists.size() > 1) {
                StringBuilder bio = new StringBuilder();
                for (String artist : artists) {
                    if (!bio.isEmpty()) {
                        bio.append("\n\n");
                    }
                    bio.append(artist)
                            .append('\n')
                            .append(
                                    text(
                                            "artist-bio.mock.multi-draft",
                                            locale,
                                            artist,
                                            request.concertTitle()));
                }
                return new ArtistBioGenerationResult(bio.toString(), provider(), model());
            }
        }
        String artist =
                firstMatch(
                        request.sourceText(),
                        "(?im)^\\s*([\\p{L}][\\p{L} .'-]{1,60}?)\\s+là\\s+nghệ sĩ");
        if (artist == null) {
            artist =
                    firstMatch(
                            request.sourceText(),
                            "(?is)(?:nghệ danh|artist name|artist|nghệ sĩ)\\s*[:\\-]?\\s*([^\\n"
                                    + "•]{2,60}?)(?=\\s+(?:hoạt động|thị trường|ngôn ngữ|định"
                                    + " dạng)|[\\n"
                                    + "•]|$)");
        }
        String genre =
                firstMatch(
                        request.sourceText(),
                        "(?is)(?:thể loại|genre)\\s*[:\\-]?\\s*([^\\n]{2,90})");
        if (artist == null) {
            artist = text("artist-bio.mock.artist", locale);
        }
        String genreSentence =
                genre == null
                        ? text("artist-bio.mock.general-style", locale)
                        : text("artist-bio.mock.genre", locale, genre);
        String bio =
                text(
                        "artist-bio.mock.draft",
                        locale,
                        artist,
                        request.concertTitle(),
                        genreSentence);
        return new ArtistBioGenerationResult(bio, provider(), model());
    }

    private String text(String key, Locale locale, Object... arguments) {
        return messages.getMessage(key, arguments, locale);
    }

    private Set<String> detectedArtists(String text) {
        Set<String> artists = new LinkedHashSet<>();
        Matcher matcher =
                Pattern.compile("(?im)^\\s*Artist\\s*:\\s*(.{2,80})$")
                        .matcher(text == null ? "" : text);
        while (matcher.find()) {
            String artist = matcher.group(1).replaceAll("\\s+", " ").trim();
            if (!artist.toLowerCase().startsWith("chua xac dinh")) {
                artists.add(artist);
            }
        }
        return artists;
    }

    private String firstMatch(String text, String expression) {
        Matcher matcher =
                Pattern.compile(expression, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)
                        .matcher(text == null ? "" : text);
        if (!matcher.find()) {
            return null;
        }
        String value = matcher.group(1).replaceAll("\\s+", " ").trim();
        return value.isBlank() ? null : value;
    }
}
