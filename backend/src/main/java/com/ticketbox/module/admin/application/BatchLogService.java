package com.ticketbox.module.admin.application;

import com.ticketbox.module.admin.domain.BatchLog;
import com.ticketbox.module.admin.domain.BatchLogRepository;
import com.ticketbox.module.admin.web.dto.BatchLogResponse;
import com.ticketbox.module.concert.ConcertReportingPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class BatchLogService {

    private final BatchLogRepository batchLogRepository;
    private final GuestListAccessService accessService;
    private final ConcertReportingPort concertReportingPort;

    public BatchLogService(
            BatchLogRepository batchLogRepository,
            GuestListAccessService accessService,
            ConcertReportingPort concertReportingPort) {
        this.batchLogRepository = batchLogRepository;
        this.accessService = accessService;
        this.concertReportingPort = concertReportingPort;
    }

    public Page<BatchLogResponse> list(
            UUID userId,
            boolean admin,
            UUID concertId,
            BatchLog.Status status,
            BatchLog.Source source,
            Pageable pageable) {
        Specification<BatchLog> specification =
                (root, query, builder) -> builder.equal(root.get("jobName"), "GUEST_LIST_IMPORT");

        if (concertId != null) {
            accessService.requireAccess(concertId, userId, admin);
            specification = specification.and(
                    (root, query, builder) -> builder.equal(root.get("concertId"), concertId));
        } else if (!admin) {
            List<UUID> ownedConcerts = concertReportingPort.findConcertIdsOwnedBy(userId);
            specification = specification.and((root, query, builder) ->
                    ownedConcerts.isEmpty()
                            ? builder.disjunction()
                            : root.get("concertId").in(ownedConcerts));
        }
        if (status != null) {
            specification = specification.and(
                    (root, query, builder) -> builder.equal(root.get("status"), status));
        }
        if (source != null) {
            specification = specification.and(
                    (root, query, builder) -> builder.equal(root.get("source"), source));
        }

        return batchLogRepository.findAll(specification, pageable).map(this::toResponse);
    }

    public BatchLogResponse get(UUID id, UUID userId, boolean admin) {
        BatchLog log = batchLogRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy lịch sử import"));
        if (log.getConcertId() != null) {
            accessService.requireAccess(log.getConcertId(), userId, admin);
        } else if (!admin) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy lịch sử import");
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
