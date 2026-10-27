package com.ticketbox.module.ai.application;

import com.ticketbox.module.ai.domain.ArtistPdfJob;
import com.ticketbox.module.ai.domain.ArtistPdfJobRepository;
import com.ticketbox.module.ai.infrastructure.ArtistPdfFileStorage;
import com.ticketbox.module.ai.infrastructure.StoredArtistPdf;
import com.ticketbox.module.ai.web.dto.ArtistBioJobResponse;
import com.ticketbox.module.concert.ConcertArtistBioPort;
import com.ticketbox.module.concert.ConcertReportingPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.nio.file.Path;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ArtistBioJobService {

    private static final List<ArtistPdfJob.Status> DEDUPLICATED_STATUSES =
            List.of(
                    ArtistPdfJob.Status.PENDING,
                    ArtistPdfJob.Status.PROCESSING,
                    ArtistPdfJob.Status.DONE);

    private final ArtistPdfJobRepository jobRepository;
    private final ArtistPdfFileStorage fileStorage;
    private final ConcertArtistBioPort concertPort;
    private final ConcertReportingPort concertReportingPort;
    private final ApplicationEventPublisher eventPublisher;

    @Value("${ticketbox.ai.recovery.pending-after:PT30S}")
    private Duration pendingRecoveryAfter = Duration.ofSeconds(30);

    @Value("${ticketbox.ai.recovery.processing-timeout:PT2M}")
    private Duration processingTimeout = Duration.ofMinutes(2);

    public ArtistBioJobService(
            ArtistPdfJobRepository jobRepository,
            ArtistPdfFileStorage fileStorage,
            ConcertArtistBioPort concertPort,
            ConcertReportingPort concertReportingPort,
            ApplicationEventPublisher eventPublisher) {
        this.jobRepository = jobRepository;
        this.fileStorage = fileStorage;
        this.concertPort = concertPort;
        this.concertReportingPort = concertReportingPort;
        this.eventPublisher = eventPublisher;
    }

    @Transactional(readOnly = true)
    public Page<ArtistBioJobResponse> list(
            UUID requesterId,
            boolean admin,
            UUID concertId,
            ArtistPdfJob.Status status,
            Pageable pageable) {
        Specification<ArtistPdfJob> specification = Specification.where(null);

        if (concertId != null) {
            concertPort.requireAccessibleConcert(concertId, requesterId, admin);
            specification = specification.and(
                    (root, query, builder) -> builder.equal(root.get("concertId"), concertId));
        } else if (!admin) {
            List<UUID> ownedConcertIds = concertReportingPort.findConcertIdsOwnedBy(requesterId);
            specification = specification.and((root, query, builder) ->
                    ownedConcertIds.isEmpty()
                            ? builder.disjunction()
                            : root.get("concertId").in(ownedConcertIds));
        }

        if (status != null) {
            specification = specification.and(
                    (root, query, builder) -> builder.equal(root.get("status"), status));
        }

        return jobRepository.findAll(specification, pageable).map(ArtistBioJobResponse::from);
    }

    @Transactional
    public ArtistPdfJob submit(
            UUID concertId,
            MultipartFile file,
            UUID requesterId,
            boolean admin) {
        concertPort.requireAccessibleConcert(concertId, requesterId, admin);

        StoredArtistPdf stored = fileStorage.store(concertId, file);
        try {
            ArtistPdfJob duplicate = jobRepository
                    .findFirstByConcertIdAndFileChecksumAndStatusInOrderByCreatedAtDesc(
                            concertId,
                            stored.checksum(),
                            DEDUPLICATED_STATUSES)
                    .orElse(null);
            if (duplicate != null) {
                fileStorage.deleteQuietly(stored.path());
                return duplicate;
            }

            ArtistPdfJob job = new ArtistPdfJob(
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
    public ArtistBioJobResponse get(
            UUID jobId,
            UUID requesterId,
            boolean admin) {
        ArtistPdfJob job = requireJob(jobId);
        concertPort.requireAccessibleConcert(job.getConcertId(), requesterId, admin);
        return ArtistBioJobResponse.from(job);
    }

    @Transactional
    public void delete(
            UUID jobId,
            UUID requesterId,
            boolean admin) {
        ArtistPdfJob job = requireJob(jobId);
        concertPort.requireAccessibleConcert(job.getConcertId(), requesterId, admin);
        jobRepository.delete(job);
    }

    @Transactional
    public ArtistPdfJob retry(
            UUID jobId,
            UUID requesterId,
            boolean admin) {
        ArtistPdfJob job = requireJob(jobId);
        concertPort.requireAccessibleConcert(job.getConcertId(), requesterId, admin);
        if (job.getStatus() != ArtistPdfJob.Status.FAILED) {
            throw new AppException(
                    ErrorCode.ARTIST_BIO_JOB_NOT_READY,
                    "Chỉ có thể chạy lại tác vụ giới thiệu nghệ sĩ đã thất bại");
        }
        Path storedPath = fileStorage.requireStoredPath(job.getFileUrl());
        if (!java.nio.file.Files.isRegularFile(storedPath)) {
            throw new AppException(
                    ErrorCode.RESOURCE_NOT_FOUND,
                    "Không tìm thấy file PDF nghệ sĩ đã lưu");
        }
        job.resetForRetry();
        ArtistPdfJob saved = jobRepository.save(job);
        eventPublisher.publishEvent(new ArtistBioJobSubmittedEvent(saved.getId()));
        return saved;
    }

    @Transactional
    public ArtistBioJobResponse apply(
            UUID jobId,
            UUID requesterId,
            boolean admin,
            boolean overwrite) {
        ArtistPdfJob job = requireJob(jobId);
        if (job.getStatus() != ArtistPdfJob.Status.DONE
                || job.getResultBio() == null
                || job.getResultBio().isBlank()) {
            throw new AppException(
                    ErrorCode.ARTIST_BIO_JOB_NOT_READY,
                    "Tác vụ giới thiệu nghệ sĩ phải hoàn tất trước khi áp dụng");
        }
        concertPort.applyArtistBio(
                job.getConcertId(),
                job.getResultBio(),
                requesterId,
                admin,
                overwrite);
        job.markApplied(requesterId);
        return ArtistBioJobResponse.from(jobRepository.save(job));
    }

    /**
     * Publishes organizer-reviewed copy.  AI output is intentionally only a
     * draft; the public concert page never receives it until this action.
     */
    @Transactional
    public void publishReviewedBio(
            UUID concertId,
            String artistBio,
            UUID requesterId,
            boolean admin) {
        String cleaned = new ArtistBioTextCleaner().sanitizeGeneratedBio(artistBio);
        if (cleaned.isBlank()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Giới thiệu nghệ sĩ không được để trống");
        }
        concertPort.applyArtistBio(concertId, cleaned, requesterId, admin, true);
    }

    /**
     * Restores jobs that were queued before a process restart and makes a failed
     * state visible for jobs whose worker died while processing.
     */
    @Scheduled(fixedDelayString = "${ticketbox.ai.recovery.fixed-delay-ms:30000}")
    @Transactional
    @net.javacrumbs.shedlock.spring.annotation.SchedulerLock(name="artistBioRecovery",lockAtMostFor="PT5M",lockAtLeastFor="PT5S")
    public void recoverStalledJobs() {
        OffsetDateTime now = OffsetDateTime.now();
        jobRepository.findByStatusAndCreatedAtBefore(
                        ArtistPdfJob.Status.PENDING,
                        now.minus(pendingRecoveryAfter))
                .forEach(job -> eventPublisher.publishEvent(new ArtistBioJobSubmittedEvent(job.getId())));

        jobRepository.findByStatusAndStartedAtBefore(
                        ArtistPdfJob.Status.PROCESSING,
                        now.minus(processingTimeout))
                .forEach(job -> {
                    job.fail("Xử lý giới thiệu nghệ sĩ quá thời gian. Hãy chạy lại tác vụ này.");
                    jobRepository.save(job);
                });
    }

    private ArtistPdfJob requireJob(UUID jobId) {
        return jobRepository.findById(jobId)
                .orElseThrow(() -> new AppException(
                        ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy tác vụ giới thiệu nghệ sĩ"));
    }
}
