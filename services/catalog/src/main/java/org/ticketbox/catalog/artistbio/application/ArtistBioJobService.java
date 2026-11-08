package org.ticketbox.catalog.artistbio.application;

import com.ticketbox.module.ai.application.ArtistBioJobSubmittedEvent;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.Upload;
import org.ticketbox.catalog.artistbio.application.dto.ArtistBioJobResponse;
import org.ticketbox.catalog.artistbio.application.port.ArtistDocuments;
import org.ticketbox.catalog.artistbio.application.port.ArtistBioMessages;
import org.ticketbox.catalog.artistbio.application.port.ArtistPdfJobRepository;
import org.ticketbox.catalog.artistbio.application.port.StoredArtistPdf;
import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioPort;

import java.nio.file.Path;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class ArtistBioJobService {

    private static final List<ArtistPdfJob.Status> DEDUPLICATED_STATUSES =
            List.of(
                    ArtistPdfJob.Status.PENDING,
                    ArtistPdfJob.Status.PROCESSING,
                    ArtistPdfJob.Status.DONE);

    private final ArtistPdfJobRepository jobRepository;
    private final ArtistDocuments fileStorage;
    private final ConcertArtistBioPort concertPort;
    private final ApplicationEventPublisher eventPublisher;
    private final ArtistBioMessages messages;

    @Value("${ticketbox.ai.recovery.pending-after:PT30S}")
    private Duration pendingRecoveryAfter = Duration.ofSeconds(30);

    @Value("${ticketbox.ai.recovery.processing-timeout:PT2M}")
    private Duration processingTimeout = Duration.ofMinutes(2);

    public ArtistBioJobService(
            ArtistPdfJobRepository jobRepository,
            ArtistDocuments fileStorage,
            ConcertArtistBioPort concertPort,
            ApplicationEventPublisher eventPublisher,
            ArtistBioMessages messages) {
        this.jobRepository = jobRepository;
        this.fileStorage = fileStorage;
        this.concertPort = concertPort;
        this.eventPublisher = eventPublisher;
        this.messages = messages;
    }

    @Transactional(readOnly = true)
    public Page<ArtistBioJobResponse> list(
            UUID requesterId,
            boolean admin,
            UUID concertId,
            ArtistPdfJob.Status status,
            Pageable pageable) {
        List<UUID> accessible = null;
        if (concertId != null) {
            concertPort.requireAccessibleConcert(concertId, requesterId, admin);
        } else if (!admin) {
            accessible = concertPort.findConcertIdsOwnedBy(requesterId);
        }
        return jobRepository
                .search(concertId, accessible, status, pageable)
                .map(ArtistBioJobResponse::from);
    }

    @Transactional
    public ArtistPdfJob submit(UUID concertId, Upload file, UUID requesterId, boolean admin) {
        concertPort.requireAccessibleConcert(concertId, requesterId, admin);

        StoredArtistPdf stored = fileStorage.store(concertId, file);
        try {
            ArtistPdfJob duplicate =
                    jobRepository
                            .findFirstByConcertIdAndFileChecksumAndStatusInOrderByCreatedAtDesc(
                                    concertId, stored.checksum(), DEDUPLICATED_STATUSES)
                            .orElse(null);
            if (duplicate != null) {
                fileStorage.deleteQuietly(stored.path());
                return duplicate;
            }

            ArtistPdfJob job =
                    new ArtistPdfJob(
                            concertId,
                            stored.path().toString(),
                            stored.originalFileName(),
                            requesterId,
                            stored.checksum());
            ArtistPdfJob saved = jobRepository.save(job);
            eventPublisher.publishEvent(new ArtistBioJobSubmittedEvent(saved.getId()));
            return saved;
        } catch (RuntimeException ex) {
            fileStorage.deleteQuietly(stored.path());
            throw ex;
        }
    }

    @Transactional(readOnly = true)
    public ArtistBioJobResponse get(UUID jobId, UUID requesterId, boolean admin) {
        ArtistPdfJob job = requireJob(jobId);
        concertPort.requireAccessibleConcert(job.getConcertId(), requesterId, admin);
        return ArtistBioJobResponse.from(job);
    }

    @Transactional
    public void delete(UUID jobId, UUID requesterId, boolean admin) {
        ArtistPdfJob job = requireJob(jobId);
        concertPort.requireAccessibleConcert(job.getConcertId(), requesterId, admin);
        jobRepository.delete(job);
    }

    @Transactional
    public ArtistPdfJob retry(UUID jobId, UUID requesterId, boolean admin) {
        ArtistPdfJob job = requireJob(jobId);
        concertPort.requireAccessibleConcert(job.getConcertId(), requesterId, admin);
        if (job.getStatus() != ArtistPdfJob.Status.FAILED) {
            throw new AppException(
                    ErrorCode.ARTIST_BIO_JOB_NOT_READY, "error.artist-bio.retry-requires-failure");
        }
        Path storedPath = fileStorage.requireStoredPath(job.getFileUrl());
        if (!java.nio.file.Files.isRegularFile(storedPath)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.artist-bio.pdf-not-found");
        }
        job.resetForRetry();
        ArtistPdfJob saved = jobRepository.save(job);
        eventPublisher.publishEvent(new ArtistBioJobSubmittedEvent(saved.getId()));
        return saved;
    }

    @Transactional
    public ArtistBioJobResponse apply(
            UUID jobId, UUID requesterId, boolean admin, boolean overwrite) {
        ArtistPdfJob job = requireJob(jobId);
        if (job.getStatus() != ArtistPdfJob.Status.DONE
                || job.getResultBio() == null
                || job.getResultBio().isBlank()) {
            throw new AppException(
                    ErrorCode.ARTIST_BIO_JOB_NOT_READY, "error.artist-bio.must-complete");
        }
        concertPort.applyArtistBio(
                job.getConcertId(), job.getResultBio(), requesterId, admin, overwrite);
        job.markApplied(requesterId);
        return ArtistBioJobResponse.from(jobRepository.save(job));
    }

    /**
     * Publishes organizer-reviewed copy. AI output is intentionally only a draft; the public
     * concert page never receives it until this action.
     */
    @Transactional
    public void publishReviewedBio(
            UUID concertId, String artistBio, UUID requesterId, boolean admin) {
        String cleaned = new ArtistBioTextCleaner().sanitizeGeneratedBio(artistBio);
        if (cleaned.isBlank()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.artist-bio.blank");
        }
        concertPort.applyArtistBio(concertId, cleaned, requesterId, admin, true);
    }

    /**
     * Restores jobs that were queued before a process restart and makes a failed state visible for
     * jobs whose worker died while processing.
     */
    @Scheduled(fixedDelayString = "${ticketbox.ai.recovery.fixed-delay-ms:30000}")
    @Transactional
    @net.javacrumbs.shedlock.spring.annotation.SchedulerLock(
            name = "artistBioRecovery",
            lockAtMostFor = "PT5M",
            lockAtLeastFor = "PT5S")
    public void recoverStalledJobs() {
        OffsetDateTime now = OffsetDateTime.now();
        jobRepository
                .findByStatusAndCreatedAtBefore(
                        ArtistPdfJob.Status.PENDING, now.minus(pendingRecoveryAfter))
                .forEach(
                        job ->
                                eventPublisher.publishEvent(
                                        new ArtistBioJobSubmittedEvent(job.getId())));

        jobRepository
                .findByStatusAndStartedAtBefore(
                        ArtistPdfJob.Status.PROCESSING, now.minus(processingTimeout))
                .forEach(
                        job -> {
                            job.fail(messages.text("artist-bio.job-timed-out"));
                            jobRepository.save(job);
                        });
    }

    private ArtistPdfJob requireJob(UUID jobId) {
        return jobRepository
                .findById(jobId)
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND,
                                        "error.artist-bio.job-not-found"));
    }
}
