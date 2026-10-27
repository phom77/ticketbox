package com.ticketbox.module.checkin.application;

import com.ticketbox.module.concert.CheckinConcertView;
import com.ticketbox.module.concert.ConcertCheckinPort;
import com.ticketbox.module.checkin.domain.CheckinLog;
import com.ticketbox.module.checkin.domain.CheckinLogRepository;
import com.ticketbox.module.checkin.web.dto.CheckinDatasetResponse;
import com.ticketbox.module.checkin.web.dto.CheckinDatasetResponse.TicketDatasetEntry;
import com.ticketbox.module.checkin.web.dto.CheckinHistoryResponse;
import com.ticketbox.module.checkin.web.dto.CheckinSummaryResponse;
import com.ticketbox.module.checkin.web.dto.ScanTicketRequest;
import com.ticketbox.module.checkin.web.dto.ScanTicketResponse;
import com.ticketbox.module.checkin.web.dto.StaffConcertOverviewResponse;
import com.ticketbox.module.checkin.web.dto.StaffConcertResponse;
import com.ticketbox.module.checkin.web.dto.StaffTicketResponse;
import com.ticketbox.module.checkin.web.dto.SyncCheckinRequest;
import com.ticketbox.module.checkin.web.dto.SyncCheckinResponse;
import com.ticketbox.module.checkin.web.dto.SyncCheckinResponse.SyncResultEntry;
import com.ticketbox.module.ticket.TicketCheckinStats;
import com.ticketbox.module.ticket.TicketCheckinPort;
import com.ticketbox.module.ticket.TicketView;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CheckinService {

    private final TicketCheckinPort ticketCheckinPort;
    private final CheckinLogRepository checkinLogRepository;
    private final QrJwtService qrJwtService;
    private final CheckinSyncHelper checkinSyncHelper;
    private final ConcertCheckinPort concertCheckinPort;

    @Transactional(readOnly = true)
    public Page<StaffConcertResponse> getStaffConcerts(String status, Pageable pageable) {
        return concertCheckinPort.findByStatus(status, pageable)
                .map(this::toStaffConcertResponse);
    }

    @Transactional(readOnly = true)
    public StaffConcertOverviewResponse getStaffConcertOverview(UUID concertId) {
        CheckinConcertView concert = getConcert(concertId);
        TicketCheckinStats stats = ticketCheckinPort.getStats(concertId);

        return new StaffConcertOverviewResponse(
                toStaffConcertResponse(concert),
                stats.total(),
                stats.valid(),
                stats.used(),
                stats.cancelled(),
                stats.transferred(),
                checkinLogRepository.countByConcertId(concertId),
                stats.datasetUpdatedAt()
        );
    }

    @Transactional(readOnly = true)
    public CheckinSummaryResponse getCheckinSummary(UUID concertId) {
        getConcert(concertId);
        TicketCheckinStats stats = ticketCheckinPort.getStats(concertId);
        long checkedIn = checkinLogRepository.countByConcertId(concertId);
        long offline = checkinLogRepository.countOfflineByConcertId(concertId);

        return new CheckinSummaryResponse(
                concertId,
                stats.total(),
                stats.valid(),
                stats.used(),
                stats.cancelled(),
                stats.transferred(),
                checkedIn,
                Math.max(0, checkedIn - offline),
                offline,
                checkinLogRepository.findLatestCheckedAtByConcertId(concertId),
                stats.datasetUpdatedAt()
        );
    }

    @Transactional(readOnly = true)
    public Page<StaffTicketResponse> getStaffTickets(
            UUID concertId,
            String query,
            String status,
            Pageable pageable
    ) {
        getConcert(concertId);
        return ticketCheckinPort.findByConcertId(concertId, query, status, pageable)
                .map(ticket -> new StaffTicketResponse(
                        ticket.id(),
                        ticket.ticketTypeId(),
                        ticket.userId(),
                        ticket.qrCode(),
                        ticket.status(),
                        ticket.issuedAt(),
                        ticket.usedAt()
                ));
    }

    @Transactional
    public ScanTicketResponse scan(ScanTicketRequest request, UUID staffId) {
        OffsetDateTime now = OffsetDateTime.now();

        TicketView ticket = ticketCheckinPort.findByQrCode(request.qrCode()).orElse(null);
        if (ticket == null) {
            return new ScanTicketResponse(null, request.concertId(), "FAILED", "Mã QR không hợp lệ", now);
        }

        if (!ticket.concertId().equals(request.concertId())) {
            return new ScanTicketResponse(ticket.id(), ticket.concertId(), "FAILED", "Vé không thuộc concert này", now);
        }

        // Atomic UPDATE: sets status = USED only if current status = VALID.
        // Handles concurrent scans correctly — only one will get rowsAffected = 1.
        boolean marked = ticketCheckinPort.markAsUsedIfValid(ticket.id(), now);
        if (!marked) {
            return new ScanTicketResponse(ticket.id(), ticket.concertId(), "FAILED", "Vé không hợp lệ để check-in", now);
        }

        // Log after successful atomic mark — safe, no exception risk from duplicate constraint
        CheckinLog log = new CheckinLog(
                ticket.id(),
                ticket.concertId(),
                staffId,
                request.deviceId(),
                now,
                false,
                request.gate()
        );
        checkinLogRepository.save(log);

        return new ScanTicketResponse(
                ticket.id(),
                ticket.concertId(),
                "SUCCESS",
                "Check-in thành công",
                now
        );
    }

    @Transactional(readOnly = true)
    public CheckinDatasetResponse getCheckinDataset(UUID concertId) {
        List<TicketView> tickets = ticketCheckinPort.findByConcertIdAndStatusValid(concertId);

        List<TicketDatasetEntry> entries = tickets.stream()
                .map(t -> new TicketDatasetEntry(
                        t.id(),
                        t.qrCode(),
                        t.qrSecret(),
                        t.ticketTypeId(),
                        t.userId()
                ))
                .toList();

        return new CheckinDatasetResponse(concertId, OffsetDateTime.now(), entries.size(), entries);
    }

    @Transactional(readOnly = true)
    public Page<CheckinHistoryResponse> getCheckinHistory(UUID concertId, Pageable pageable) {
        Page<CheckinLog> logs = checkinLogRepository.findByConcertId(concertId, pageable);
        Map<UUID, TicketView> ticketsById = ticketCheckinPort.findByIds(
                logs.getContent().stream().map(CheckinLog::getTicketId).toList()
        );

        return logs.map(log -> {
            TicketView ticket = ticketsById.get(log.getTicketId());
            return new CheckinHistoryResponse(
                        log.getId(),
                        log.getTicketId(),
                        log.getConcertId(),
                        log.getStaffId(),
                        log.getDeviceId(),
                        log.getCheckedAt(),
                        log.getSyncAt(),
                        log.isOffline(),
                        log.getGate(),
                        log.getNotes(),
                        ticket == null ? null : ticket.qrCode(),
                        ticket == null ? null : ticket.status()
                );
        });
    }

    @Transactional
    public SyncCheckinResponse syncOfflineLogs(SyncCheckinRequest request, UUID staffId) {
        List<SyncResultEntry> results = new ArrayList<>();
        int accepted = 0;
        int skipped  = 0;
        int invalid  = 0;

        for (SyncCheckinRequest.OfflineLogEntry entry : request.logs()) {

            TicketView ticket = ticketCheckinPort.findByQrCode(entry.qrCode()).orElse(null);
            if (ticket == null) {
                results.add(new SyncResultEntry(entry.qrCode(), "INVALID", "Không tìm thấy mã QR"));
                invalid++;
                continue;
            }

            if (!qrJwtService.verify(entry.qrCode(), ticket.qrSecret())) {
                results.add(new SyncResultEntry(entry.qrCode(), "INVALID", "Chữ ký QR không hợp lệ"));
                invalid++;
                continue;
            }

            if (!ticket.concertId().equals(request.concertId())) {
                results.add(new SyncResultEntry(entry.qrCode(), "INVALID", "Vé không thuộc concert này"));
                invalid++;
                continue;
            }

            if ("CANCELLED".equals(ticket.status())
                    || "TRANSFERRED".equals(ticket.status())) {
                results.add(new SyncResultEntry(entry.qrCode(), "INVALID", "Vé đã bị hủy hoặc đã chuyển nhượng"));
                invalid++;
                continue;
            }

            if ("USED".equals(ticket.status())) {
                results.add(new SyncResultEntry(entry.qrCode(), "SKIPPED", "Vé đã được sử dụng trên máy chủ"));
                skipped++;
                continue;
            }

            SyncResultEntry result = checkinSyncHelper.syncSingleEntry(
                    entry, ticket, staffId, request.deviceId());
            results.add(result);

            switch (result.result()) {
                case "ACCEPTED" -> accepted++;
                case "SKIPPED"  -> skipped++;
                default         -> invalid++;
            }
        }

        return new SyncCheckinResponse(request.logs().size(), accepted, skipped, invalid, results);
    }

    private CheckinConcertView getConcert(UUID concertId) {
        return concertCheckinPort.findById(concertId)
                .orElseThrow(() -> new AppException(
                        ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert với ID: " + concertId
                ));
    }

    private StaffConcertResponse toStaffConcertResponse(CheckinConcertView concert) {
        return new StaffConcertResponse(
                concert.id(),
                concert.title(),
                concert.venueName(),
                concert.venueAddress(),
                concert.eventDate(),
                concert.doorsOpenAt(),
                concert.status(),
                concert.posterUrl()
        );
    }
}
