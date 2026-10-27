package com.ticketbox.module.ai.infrastructure;

import com.ticketbox.module.ai.application.ArtistBioGenerationRequest;
import com.ticketbox.module.ai.application.ArtistBioGenerationResult;
import com.ticketbox.module.ai.application.ArtistBioGenerator;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class MockArtistBioGenerator implements ArtistBioGenerator {

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
        if (request.sourceText() != null && request.sourceText().contains("Composition mode: MULTI_ARTIST")) {
            Set<String> artists = detectedArtists(request.sourceText());
            if (artists.size() > 1) {
                StringBuilder bio = new StringBuilder();
                for (String artist : artists) {
                    if (!bio.isEmpty()) {
                        bio.append("\n\n");
                    }
                    bio.append(artist)
                            .append("\n")
                            .append(artist)
                            .append(" duoc tong hop thanh mot muc rieng tu cac ho so da chon cho concert ")
                            .append(request.concertTitle())
                            .append(". Ban nhap nay giu cac chi tiet rieng cua nghe si va can duoc bien tap truoc khi xuat ban.");
                }
                return new ArtistBioGenerationResult(bio.toString(), provider(), model());
            }
        }
        String artist = firstMatch(request.sourceText(),
                "(?im)^\\s*([\\p{L}][\\p{L} .'-]{1,60}?)\\s+là\\s+nghệ sĩ");
        if (artist == null) {
            artist = firstMatch(request.sourceText(),
                "(?is)(?:nghệ danh|artist name|artist|nghệ sĩ)\\s*[:\\-]?\\s*([^\\n•]{2,60}?)(?=\\s+(?:hoạt động|thị trường|ngôn ngữ|định dạng)|[\\n•]|$)");
        }
        String genre = firstMatch(request.sourceText(),
                "(?is)(?:thể loại|genre)\\s*[:\\-]?\\s*([^\\n]{2,90})");
        if (artist == null) {
            artist = "Nghệ sĩ biểu diễn";
        }
        String genreSentence = genre == null
                ? "Hồ sơ cung cấp thông tin về phong cách biểu diễn và hành trình sáng tạo của nghệ sĩ."
                : "Nghệ sĩ theo đuổi màu sắc " + genre + ".";
        String bio = ("%s là nghệ sĩ được giới thiệu trong hồ sơ của concert %s. %s "
                + "Bản nháp này được tạo từ tài liệu đã tải lên; hãy biên tập và xác nhận trước khi xuất bản.")
                .formatted(artist, request.concertTitle(), genreSentence);
        return new ArtistBioGenerationResult(bio, provider(), model());
    }

    private Set<String> detectedArtists(String text) {
        Set<String> artists = new LinkedHashSet<>();
        Matcher matcher = Pattern.compile("(?im)^\\s*Artist\\s*:\\s*(.{2,80})$").matcher(text == null ? "" : text);
        while (matcher.find()) {
            String artist = matcher.group(1).replaceAll("\\s+", " ").trim();
            if (!artist.toLowerCase().startsWith("chua xac dinh")) {
                artists.add(artist);
            }
        }
        return artists;
    }

    private String firstMatch(String text, String expression) {
        Matcher matcher = Pattern.compile(expression, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)
                .matcher(text == null ? "" : text);
        if (!matcher.find()) {
            return null;
        }
        String value = matcher.group(1).replaceAll("\\s+", " ").trim();
        return value.isBlank() ? null : value;
    }
}
