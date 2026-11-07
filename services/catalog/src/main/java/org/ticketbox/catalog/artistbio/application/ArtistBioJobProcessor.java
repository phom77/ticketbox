package org.ticketbox.catalog.artistbio.application;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.artistbio.application.port.ArtistBioGenerators;
import org.ticketbox.catalog.artistbio.application.port.ArtistDocuments;
import org.ticketbox.catalog.artistbio.application.port.ArtistPdfJobRepository;
import org.ticketbox.catalog.artistbio.application.port.ExtractedPdf;
import org.ticketbox.catalog.artistbio.application.port.PdfTextReader;
import org.ticketbox.catalog.artistbio.application.port.TextLimits;
import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioPort;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioView;

import java.nio.file.Path;
import java.util.UUID;

@Component
public class ArtistBioJobProcessor {

    private static final int DESIRED_BIO_WORDS = 160;
    private static final int MAX_ERROR_LENGTH = 1_000;

    private final ArtistPdfJobRepository jobRepository;
    private final ArtistDocuments fileStorage;
    private final PdfTextReader textExtractor;
    private final ArtistBioTextCleaner textCleaner;
    private final ArtistBioGenerators generatorResolver;
    private final ConcertArtistBioPort concertPort;
    private final TextLimits properties;
    private final TransactionTemplate transactionTemplate;

    public ArtistBioJobProcessor(
            ArtistPdfJobRepository jobRepository,
            ArtistDocuments fileStorage,
            PdfTextReader textExtractor,
            ArtistBioTextCleaner textCleaner,
            ArtistBioGenerators generatorResolver,
            ConcertArtistBioPort concertPort,
            TextLimits properties,
            TransactionTemplate transactionTemplate) {
        this.jobRepository = jobRepository;
        this.fileStorage = fileStorage;
        this.textExtractor = textExtractor;
        this.textCleaner = textCleaner;
        this.generatorResolver = generatorResolver;
        this.concertPort = concertPort;
        this.properties = properties;
        this.transactionTemplate = transactionTemplate;
    }

    public void process(UUID jobId) {
        ProcessingJob job = start(jobId);
        if (job == null) {
            return;
        }

        try {
            Path path = fileStorage.requireStoredPath(job.fileUrl());
            ExtractedPdf extracted = textExtractor.extract(path);
            String cleaned =
                    textCleaner.clean(extracted.text(), properties.getMaxInputCharacters());
            if (cleaned.isBlank()) {
                throw new AppException(
                        ErrorCode.INVALID_REQUEST, "PDF contains no usable text after cleaning");
            }

            ConcertArtistBioView concert = concertPort.requireConcert(job.concertId());
            ArtistBioGenerator generator = generatorResolver.resolve();
            ArtistBioGenerationResult generated =
                    generator.generate(
                            new ArtistBioGenerationRequest(
                                    concert.title(), cleaned, "Vietnamese", DESIRED_BIO_WORDS));
            String sanitized = textCleaner.sanitizeGeneratedBio(generated.bio());
            if (sanitized.isBlank()) {
                throw new AppException(
                        ErrorCode.AI_PROVIDER_UNAVAILABLE,
                        "AI provider returned no usable artist biography");
            }
            complete(
                    jobId,
                    job.startedAt(),
                    sanitized,
                    generated.provider(),
                    generated.model(),
                    cleaned.length());
        } catch (Exception ex) {
            fail(jobId, job.startedAt(), safeError(ex));
        }
    }

    private ProcessingJob start(UUID jobId) {
        return transactionTemplate.execute(
                status -> {
                    ArtistPdfJob job = jobRepository.findByIdForUpdate(jobId).orElse(null);
                    if (job == null || job.getStatus() != ArtistPdfJob.Status.PENDING) {
                        return null;
                    }
                    job.startProcessing();
                    jobRepository.save(job);
                    return new ProcessingJob(
                            job.getConcertId(), job.getFileUrl(), job.getStartedAt());
                });
    }

    private void complete(
            UUID jobId,
            java.time.OffsetDateTime startedAt,
            String bio,
            String provider,
            String model,
            int extractedCharCount) {
        transactionTemplate.executeWithoutResult(
                status ->
                        jobRepository
                                .findByIdForUpdate(jobId)
                                .filter(
                                        job ->
                                                job.getStatus() == ArtistPdfJob.Status.PROCESSING
                                                        && startedAt
                                                                .toInstant()
                                                                .equals(
                                                                        job.getStartedAt()
                                                                                .toInstant()))
                                .ifPresent(
                                        job -> {
                                            job.complete(bio, provider, model, extractedCharCount);
                                            jobRepository.save(job);
                                        }));
    }

    private void fail(UUID jobId, java.time.OffsetDateTime startedAt, String error) {
        transactionTemplate.executeWithoutResult(
                status ->
                        jobRepository
                                .findByIdForUpdate(jobId)
                                .filter(
                                        job ->
                                                job.getStatus() == ArtistPdfJob.Status.PROCESSING
                                                        && startedAt
                                                                .toInstant()
                                                                .equals(
                                                                        job.getStartedAt()
                                                                                .toInstant()))
                                .ifPresent(
                                        job -> {
                                            job.fail(error);
                                            jobRepository.save(job);
                                        }));
    }

    private String safeError(Exception exception) {
        String message =
                exception instanceof AppException
                        ? exception.getMessage()
                        : "Tạo giới thiệu nghệ sĩ thất bại";
        if (message == null || message.isBlank()) {
            message = "Tạo giới thiệu nghệ sĩ thất bại";
        }
        return message.length() <= MAX_ERROR_LENGTH
                ? message
                : message.substring(0, MAX_ERROR_LENGTH);
    }

    private record ProcessingJob(
            UUID concertId, String fileUrl, java.time.OffsetDateTime startedAt) {}
}
