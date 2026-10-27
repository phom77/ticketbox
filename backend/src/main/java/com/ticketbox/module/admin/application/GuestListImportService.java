package com.ticketbox.module.admin.application;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import com.ticketbox.module.admin.infrastructure.batch.GuestListFileStorage;
import com.ticketbox.module.admin.infrastructure.batch.GuestListImportProperties;
import com.ticketbox.module.admin.infrastructure.batch.GuestListJobRunner;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
public class GuestListImportService {

    private static final List<BatchLog.Status> DEDUPLICATED_STATUSES =
            List.of(
                    BatchLog.Status.PENDING,
                    BatchLog.Status.RUNNING,
                    BatchLog.Status.SUCCESS,
                    BatchLog.Status.PARTIAL);

    private final BatchLogRepository batchLogRepository;
    private final GuestListFileStorage fileStorage;
    private final GuestListImportProperties properties;
    private final GuestListJobRunner jobRunner;
    private final GuestListAccessService accessService;

    public GuestListImportService(
            BatchLogRepository batchLogRepository,
            GuestListFileStorage fileStorage,
            GuestListImportProperties properties,
            GuestListJobRunner jobRunner,
            GuestListAccessService accessService) {
        this.batchLogRepository = batchLogRepository;
        this.fileStorage = fileStorage;
        this.properties = properties;
        this.jobRunner = jobRunner;
        this.accessService = accessService;
    }

    public BatchLog submitUpload(
            UUID concertId,
            MultipartFile file,
            UUID userId,
            boolean admin) {
        accessService.requireAccess(concertId, userId, admin);
        validateUpload(file);

        Path stored = null;
        try {
            stored = fileStorage.storeUpload(concertId, file);
            return submit(
                    concertId,
                    stored,
                    safeOriginalName(file.getOriginalFilename()),
                    BatchLog.Source.UPLOAD);
        } catch (IOException ex) {
            if (stored != null) {
                fileStorage.deleteQuietly(stored);
            }
            throw new AppException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể lưu file CSV");
        }
    }

    public BatchLog queueScheduledUpload(
            UUID concertId,
            MultipartFile file,
            UUID userId) {
        accessService.requireAccess(concertId, userId, false);
        validateUpload(file);

        Path stored = null;
        try {
            stored = fileStorage.storeScheduledUpload(concertId, file);
            String fileName = safeOriginalName(file.getOriginalFilename());
            String checksum = fileStorage.checksum(stored);
            Optional<BatchLog> existing = findDuplicate(concertId, checksum);
            if (existing.isPresent()) {
                fileStorage.deleteQuietly(stored);
                return recordSkippedQueue(concertId, fileName, checksum, existing.get());
            }

            BatchLog pending = new BatchLog();
            pending.setJobName("GUEST_LIST_IMPORT");
            pending.setConcertId(concertId);
            pending.setSource(BatchLog.Source.SCHEDULED);
            pending.setChecksum(checksum);
            pending.setFileName(fileName);
            pending.setFilePath(stored.toString());
            pending.setStartedAt(OffsetDateTime.now());
            pending.setStatus(BatchLog.Status.PENDING);
            try {
                return batchLogRepository.saveAndFlush(pending);
            } catch (DataIntegrityViolationException race) {
                BatchLog duplicate = findDuplicate(concertId, checksum).orElseThrow(() -> race);
                fileStorage.deleteQuietly(stored);
                return recordSkippedQueue(concertId, fileName, checksum, duplicate);
            }
        } catch (IOException ex) {
            if (stored != null) {
                fileStorage.deleteQuietly(stored);
            }
            throw new AppException(
                    ErrorCode.INTERNAL_SERVER_ERROR,
                    "Không thể đưa file CSV vào hàng chờ import theo lịch");
        }
    }

    public BatchLog submitScheduled(UUID concertId, Path claimedFile, String originalFileName) {
        return submitScheduled(concertId, claimedFile, originalFileName, null);
    }

    public BatchLog submitScheduled(
            UUID concertId,
            Path claimedFile,
            String originalFileName,
            Path queuedPath) {
        try {
            if (fileStorage.size(claimedFile) > properties.getMaxFileSize().toBytes()) {
                return rejectScheduled(
                        concertId,
                        claimedFile,
                        originalFileName,
                        "CSV vượt quá dung lượng tối đa đã cấu hình",
                        queuedPath);
            }
            String checksum = fileStorage.checksum(claimedFile);
            Optional<BatchLog> pending = batchLogRepository
                    .findFirstByConcertIdAndChecksumAndStatusOrderByStartedAtDesc(
                            concertId,
                            checksum,
                            BatchLog.Status.PENDING);
            if (pending.isPresent()
                    && (queuedPath == null
                            || Path.of(pending.get().getFilePath()).toAbsolutePath().normalize()
                                    .equals(queuedPath.toAbsolutePath().normalize()))) {
                return launchPending(pending.get(), claimedFile);
            }
            return submit(
                    concertId,
                    claimedFile,
                    safeOriginalName(originalFileName),
                    BatchLog.Source.SCHEDULED,
                    checksum);
        } catch (IOException ex) {
            return rejectScheduled(
                    concertId,
                    claimedFile,
                    originalFileName,
                    "Không thể kiểm tra file CSV: " + ex.getMessage(),
                    queuedPath);
        }
    }

    private BatchLog submit(
            UUID concertId,
            Path file,
            String fileName,
            BatchLog.Source source) throws IOException {
        String checksum = fileStorage.checksum(file);
        return submit(concertId, file, fileName, source, checksum);
    }

    private BatchLog submit(
            UUID concertId,
            Path file,
            String fileName,
            BatchLog.Source source,
            String checksum) throws IOException {
        Optional<BatchLog> existing = findDuplicate(concertId, checksum);
        if (existing.isPresent()) {
            if (source == BatchLog.Source.UPLOAD) {
                fileStorage.deleteQuietly(file);
                return existing.get();
            }
            return skipScheduled(concertId, file, fileName, checksum, existing.get());
        }

        BatchLog log = new BatchLog();
        log.setJobName("GUEST_LIST_IMPORT");
        log.setConcertId(concertId);
        log.setSource(source);
        log.setChecksum(checksum);
        log.setFileName(fileName);
        log.setFilePath(file.toString());
        log.setStartedAt(OffsetDateTime.now());
        log.setStatus(BatchLog.Status.RUNNING);

        try {
            log = batchLogRepository.saveAndFlush(log);
        } catch (DataIntegrityViolationException race) {
            BatchLog duplicate = findDuplicate(concertId, checksum).orElseThrow(() -> race);
            if (source == BatchLog.Source.UPLOAD) {
                fileStorage.deleteQuietly(file);
                return duplicate;
            }
            return skipScheduled(concertId, file, fileName, checksum, duplicate);
        }

        jobRunner.launch(log);
        return log;
    }

    private BatchLog launchPending(
            BatchLog pending,
            Path claimedFile) {
        pending.setFilePath(claimedFile.toString());
        pending.setStatus(BatchLog.Status.RUNNING);
        BatchLog running = batchLogRepository.saveAndFlush(pending);
        jobRunner.launch(running);
        return running;
    }

    private BatchLog recordSkippedQueue(
            UUID concertId,
            String fileName,
            String checksum,
            BatchLog original) {
        BatchLog skipped = new BatchLog();
        skipped.setJobName("GUEST_LIST_IMPORT");
        skipped.setConcertId(concertId);
        skipped.setSource(BatchLog.Source.SCHEDULED);
        skipped.setChecksum(checksum);
        skipped.setFileName(fileName);
        skipped.setStartedAt(OffsetDateTime.now());
        skipped.setCompletedAt(OffsetDateTime.now());
        skipped.setStatus(BatchLog.Status.SKIPPED);
        skipped.setErrorDetail("Trùng với batch " + original.getId());
        return batchLogRepository.save(skipped);
    }

    private BatchLog skipScheduled(
            UUID concertId,
            Path file,
            String fileName,
            String checksum,
            BatchLog original) throws IOException {
        Path archived = fileStorage.archive(file, concertId, false);
        BatchLog skipped = new BatchLog();
        skipped.setJobName("GUEST_LIST_IMPORT");
        skipped.setConcertId(concertId);
        skipped.setSource(BatchLog.Source.SCHEDULED);
        skipped.setChecksum(checksum);
        skipped.setFileName(fileName);
        skipped.setFilePath(archived.toString());
        skipped.setStartedAt(OffsetDateTime.now());
        skipped.setCompletedAt(OffsetDateTime.now());
        skipped.setStatus(BatchLog.Status.SKIPPED);
        skipped.setErrorDetail("Trùng với batch " + original.getId());
        return batchLogRepository.save(skipped);
    }

    private BatchLog rejectScheduled(
            UUID concertId,
            Path file,
            String fileName,
            String reason,
            Path queuedPath) {
        BatchLog failed = queuedPath == null
                ? new BatchLog()
                : batchLogRepository.findFirstByConcertIdAndFilePathAndStatus(
                                concertId,
                                queuedPath.toString(),
                                BatchLog.Status.PENDING)
                        .orElseGet(BatchLog::new);
        if (failed.getJobName() == null) {
            failed.setJobName("GUEST_LIST_IMPORT");
            failed.setConcertId(concertId);
            failed.setSource(BatchLog.Source.SCHEDULED);
            failed.setFileName(safeOriginalName(fileName));
            failed.setStartedAt(OffsetDateTime.now());
        }
        failed.setCompletedAt(OffsetDateTime.now());
        failed.setStatus(BatchLog.Status.FAILED);
        failed.setErrorDetail(reason);
        try {
            failed.setFilePath(fileStorage.quarantine(file, concertId).toString());
        } catch (IOException ex) {
            failed.setFilePath(file.toString());
            failed.setErrorDetail(reason + "; Không thể di chuyển file: " + ex.getMessage());
        }
        return batchLogRepository.save(failed);
    }

    private Optional<BatchLog> findDuplicate(UUID concertId, String checksum) {
        return batchLogRepository
                .findFirstByConcertIdAndChecksumAndStatusInOrderByCompletedAtDesc(
                        concertId,
                        checksum,
                        DEDUPLICATED_STATUSES);
    }

    private void validateUpload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Vui lòng chọn file CSV");
        }
        String name = file.getOriginalFilename();
        if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".csv")) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Chỉ chấp nhận file .csv");
        }
        if (file.getSize() > properties.getMaxFileSize().toBytes()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "CSV vượt quá dung lượng tối đa");
        }
    }

    private String safeOriginalName(String name) {
        if (name == null || name.isBlank()) {
            return "guest-list.csv";
        }
        String normalized = name.replace('\\', '/');
        String fileName = normalized.substring(normalized.lastIndexOf('/') + 1);
        String sanitized = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        return sanitized.isBlank() ? "guest-list.csv" : sanitized;
    }

    public void importAvailableFiles() {
        try (Stream<Path> concertDirectories = java.nio.file.Files.list(fileStorage.incomingRoot())) {
            concertDirectories.filter(java.nio.file.Files::isDirectory).forEach(this::processConcertDirectory);
        } catch (IOException ex) {
            log.error("Could not scan guest-list incoming directory", ex);
        }
    }

    private void processConcertDirectory(Path directory) {
        UUID concertId;
        try {
            concertId = UUID.fromString(directory.getFileName().toString());
        } catch (IllegalArgumentException ex) {
            log.warn("Ignoring guest-list directory with invalid concert id: {}", directory);
            return;
        }

        Instant now = Instant.now();
        try (Stream<Path> files = java.nio.file.Files.list(directory)) {
            files.filter(path -> fileStorage.isStableCsv(path, now))
                    .forEach(path -> claimAndSubmit(concertId, path));
        } catch (IOException ex) {
            log.error("Could not scan guest-list directory {}", directory, ex);
        }
    }

    private void claimAndSubmit(UUID concertId, Path path) {
        try {
            String originalName = path.getFileName().toString();
            Path claimed = fileStorage.claimScheduledFile(concertId, path);
            submitScheduled(concertId, claimed, originalName, path);
        } catch (Exception ex) {
            log.error("Could not claim guest-list file {}", path, ex);
        }
    }
}
