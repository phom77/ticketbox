package org.ticketbox.checkin.guestlist.application;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.checkin.admission.application.port.ConcertAccess;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;
import org.ticketbox.checkin.guestlist.application.dto.BatchLogResponse;
import org.ticketbox.checkin.guestlist.application.port.BatchLogRepository;
import org.ticketbox.checkin.guestlist.domain.BatchLog;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class BatchLogService {

    private final BatchLogRepository batchLogRepository;
    private final GuestListAccessService accessService;
    private final ConcertAccess concerts;

    public BatchLogService(
            BatchLogRepository batchLogRepository,
            GuestListAccessService accessService,
            ConcertAccess concerts) {
        this.batchLogRepository = batchLogRepository;
        this.accessService = accessService;
        this.concerts = concerts;
    }

    public Page<BatchLogResponse> list(
            UUID userId,
            boolean admin,
            UUID concertId,
            BatchLog.Status status,
            BatchLog.Source source,
            Pageable pageable) {
        List<UUID> accessible = null;
        if (concertId != null) {
            accessService.requireAccess(concertId, userId, admin);
        } else if (!admin) {
            accessible = concerts.findConcertIdsOwnedBy(userId);
        }
        return batchLogRepository
                .search(concertId, accessible, status, source, pageable)
                .map(this::toResponse);
    }

    public BatchLogResponse get(UUID id, UUID userId, boolean admin) {
        BatchLog log =
                batchLogRepository
                        .findById(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.guest-import.not-found"));
        if (log.getConcertId() != null) {
            accessService.requireAccess(log.getConcertId(), userId, admin);
        } else if (!admin) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.guest-import.not-found");
        }
        return toResponse(log);
    }

    public BatchLogResponse toResponse(BatchLog log) {
        return new BatchLogResponse(
                log.getId(),
                log.getJobName(),
                log.getConcertId(),
                log.getSource() == null ? null : log.getSource().name(),
                log.getFileName(),
                log.getChecksum(),
                log.getStatus().name(),
                log.getStartedAt(),
                log.getCompletedAt(),
                log.getTotalRows(),
                log.getSuccessRows(),
                log.getErrorRows(),
                log.getErrorDetail(),
                log.getFilePath(),
                log.getErrorReportPath());
    }
}
