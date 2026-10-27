package com.ticketbox.module.ai.application;

import com.ticketbox.module.ai.domain.ArtistPdfJob;
import com.ticketbox.module.ai.domain.ArtistPdfJobRepository;
import com.ticketbox.module.concert.ConcertArtistBioPort;
import com.ticketbox.module.concert.ConcertArtistBioView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.text.Normalizer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates a new reviewable draft from several completed source drafts. */
@Service
public class ArtistBioComposerService {

    private static final int DESIRED_BIO_WORDS = 140;
    private static final Pattern ARTIST_LABEL_PATTERN = Pattern.compile(
            "(?im)^\\s*(?:artist|artist name|nghe si|nghe danh|nghệ sĩ|nghệ danh)\\s*[:\\-]\\s*(.{2,80})$");
    private static final Pattern ARTIST_IS_PATTERN = Pattern.compile(
            "(?im)^\\s*([\\p{L}][\\p{L}0-9 .&'\\-]{1,80}?)\\s+(?:la|là|is)\\s+(?:nghe si|nghệ sĩ|artist|band|ban nhac|ban nhạc)");

    private final ArtistPdfJobRepository jobRepository;
    private final ConcertArtistBioPort concertPort;
    private final ArtistBioGeneratorResolver generatorResolver;
    private final ArtistBioTextCleaner textCleaner;

    public ArtistBioComposerService(
            ArtistPdfJobRepository jobRepository,
            ConcertArtistBioPort concertPort,
            ArtistBioGeneratorResolver generatorResolver,
            ArtistBioTextCleaner textCleaner) {
        this.jobRepository = jobRepository;
        this.concertPort = concertPort;
        this.generatorResolver = generatorResolver;
        this.textCleaner = textCleaner;
    }

    @Transactional
    public ArtistPdfJob compose(
            UUID concertId,
            List<UUID> sourceJobIds,
            UUID requesterId,
            boolean admin) {
        ConcertArtistBioView concert = concertPort.requireAccessibleConcert(concertId, requesterId, admin);
        List<UUID> uniqueIds = sourceJobIds.stream().distinct().toList();
        if (uniqueIds.size() < 2) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Vui lòng chọn ít nhất hai bản nháp đã hoàn tất để tổng hợp");
        }

        Map<UUID, ArtistPdfJob> jobsById = new LinkedHashMap<>();
        jobRepository.findAllById(uniqueIds).forEach(job -> jobsById.put(job.getId(), job));
        if (jobsById.size() != uniqueIds.size()) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy một hoặc nhiều bản nháp AI đã chọn");
        }

        List<ArtistPdfJob> sources = uniqueIds.stream().map(jobsById::get).toList();
        for (ArtistPdfJob source : sources) {
            if (!concertId.equals(source.getConcertId())) {
                throw new AppException(ErrorCode.INVALID_REQUEST, "Tất cả bản nháp đã chọn phải thuộc cùng một concert");
            }
            if (source.getStatus() != ArtistPdfJob.Status.DONE
                    || source.getResultBio() == null
                    || source.getResultBio().isBlank()) {
                throw new AppException(ErrorCode.ARTIST_BIO_JOB_NOT_READY, "Tất cả bản nháp AI đã chọn phải hoàn tất");
            }
        }

        GroupedSources groupedSources = groupSources(sources);
        String sourceText = groupedSources.sourceText();
        ArtistBioGenerator generator = generatorResolver.resolve();
        ArtistBioGenerationResult generated = generator.generate(new ArtistBioGenerationRequest(
                concert.title(),
                sourceText,
                "Vietnamese",
                groupedSources.multipleArtists() ? DESIRED_BIO_WORDS * groupedSources.artistCount() : DESIRED_BIO_WORDS,
                groupedSources.instruction()));
        String bio = textCleaner.sanitizeGeneratedBio(generated.bio());
        if (bio.isBlank()) {
            throw new AppException(ErrorCode.AI_PROVIDER_UNAVAILABLE, "Dịch vụ AI không trả về giới thiệu nghệ sĩ có thể sử dụng");
        }
        bio = ensureAllSourcesAreRepresented(bio, sources);

        ArtistPdfJob composed = new ArtistPdfJob(
                concertId,
                sources.getFirst().getFileUrl(),
                "Tổng hợp " + sources.size() + " tài liệu nguồn",
                requesterId,
                checksum(uniqueIds));
        composed.startProcessing();
        composed.complete(bio, generated.provider(), generated.model(), sourceText.length());
        return jobRepository.save(composed);
    }

    private GroupedSources groupSources(List<ArtistPdfJob> sources) {
        Map<String, SourceGroup> groups = new LinkedHashMap<>();
        List<ArtistPdfJob> unknownArtistSources = new ArrayList<>();
        for (ArtistPdfJob source : sources) {
            String artistName = detectArtistName(source.getResultBio());
            if (artistName.isBlank()) {
                unknownArtistSources.add(source);
                continue;
            }
            String key = normalizeArtistKey(artistName);
            groups.computeIfAbsent(key, ignored -> new SourceGroup(artistName, new ArrayList<>()))
                    .sources()
                    .add(source);
        }

        boolean multipleArtists = groups.size() > 1;
        boolean hasUnknownArtistSources = !unknownArtistSources.isEmpty();
        String compositionMode = multipleArtists
                ? "MULTI_ARTIST"
                : hasUnknownArtistSources ? "AUTO_ARTIST" : "SAME_ARTIST";
        StringBuilder sourceText = new StringBuilder()
                .append("Composition mode: ")
                .append(compositionMode)
                .append('\n');
        if (!groups.isEmpty()) {
            sourceText.append("Detected artists: ")
                    .append(String.join(", ", groups.values().stream().map(SourceGroup::artistName).toList()))
                    .append("\n\n");
        }
        for (SourceGroup group : groups.values()) {
            sourceText.append("Artist: ").append(group.artistName()).append('\n');
            sourceText.append("Sources: ")
                    .append(String.join(", ", group.sources().stream().map(ArtistPdfJob::getOriginalFileName).toList()))
                    .append('\n');
            for (ArtistPdfJob source : group.sources()) {
                sourceText.append("Nguon: ").append(source.getOriginalFileName()).append('\n')
                        .append(source.getResultBio()).append("\n\n");
            }
        }
        for (ArtistPdfJob source : unknownArtistSources) {
            sourceText.append("Unclassified source: ").append(source.getOriginalFileName()).append('\n')
                    .append(source.getResultBio()).append("\n\n");
        }

        String instruction = multipleArtists
                ? """
                The selected sources describe different artists. Return one combined plain-text draft with one clearly separated section per artist.
                Use the artist name as the plain-text section heading, then write a concise biography paragraph for that artist.
                Preserve concrete facts from every selected source. Do not merge facts between different artists.
                """
                : hasUnknownArtistSources ? """
                Decide whether the selected sources describe the same artist or different artists.
                If they clearly describe different artists, return one combined plain-text draft with one clearly separated section per artist.
                If they describe the same artist, return one cohesive biography that deduplicates repeated facts and reconciles complementary details naturally.
                Preserve concrete facts from every selected source. Do not merge facts between different artists.
                """
                : """
                The selected sources appear to describe the same artist, or the artist identity is not clearly different.
                Return one cohesive plain-text biography that deduplicates repeated facts and reconciles complementary details naturally.
                Preserve concrete facts from every selected source without listing duplicate claims.
                """;
        return new GroupedSources(sourceText.toString().trim(), instruction.trim(), multipleArtists, Math.max(1, groups.size()));
    }

    private String detectArtistName(String bio) {
        if (bio == null || bio.isBlank()) {
            return "";
        }
        String normalized = bio.replaceAll("\\s+", " ").trim();
        String labeled = firstGroup(ARTIST_LABEL_PATTERN, bio);
        if (!labeled.isBlank()) {
            return cleanArtistName(labeled);
        }
        String isPattern = firstGroup(ARTIST_IS_PATTERN, normalized);
        if (!isPattern.isBlank()) {
            return cleanArtistName(isPattern);
        }
        return "";
    }

    private String firstGroup(Pattern pattern, String value) {
        var matcher = pattern.matcher(value == null ? "" : value);
        return matcher.find() ? matcher.group(1) : "";
    }

    private String cleanArtistName(String value) {
        return value
                .replaceAll("[\\p{Cntrl}]", "")
                .replaceAll("[.,;:]+$", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String normalizeArtistKey(String value) {
        String withoutMarks = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return withoutMarks.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

    private String ensureAllSourcesAreRepresented(String generatedBio, List<ArtistPdfJob> sources) {
        String normalizedBio = generatedBio.toLowerCase(Locale.ROOT);
        List<String> missingSentences = sources.stream()
                .map(ArtistPdfJob::getResultBio)
                .map(this::firstUsefulSentence)
                .filter(sentence -> !sentence.isBlank())
                .filter(sentence -> !normalizedBio.contains(sentence.toLowerCase(Locale.ROOT)))
                .toList();
        if (missingSentences.isEmpty()) {
            return generatedBio;
        }
        StringBuilder merged = new StringBuilder(generatedBio.trim())
                .append("\n\nĐiểm bổ sung từ các hồ sơ đã chọn:");
        for (String sentence : missingSentences) {
            merged.append("\n- ").append(sentence);
        }
        return textCleaner.sanitizeGeneratedBio(merged.toString());
    }

    private String firstUsefulSentence(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.replaceAll("\\s+", " ").trim();
        String firstSentence = Pattern.compile("(?<=[.!?。])\\s+")
                .splitAsStream(normalized)
                .findFirst()
                .orElse(normalized);
        return firstSentence.substring(0, Math.min(firstSentence.length(), 260)).trim();
    }

    private String checksum(List<UUID> sourceJobIds) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(sourceJobIds.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte value : digest) {
                result.append(String.format("%02x", value));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private record SourceGroup(String artistName, List<ArtistPdfJob> sources) {
    }

    private record GroupedSources(
            String sourceText,
            String instruction,
            boolean multipleArtists,
            int artistCount) {
    }
}
