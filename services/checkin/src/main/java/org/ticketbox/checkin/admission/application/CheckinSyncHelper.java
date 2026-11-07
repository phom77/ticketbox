package org.ticketbox.checkin.admission.application;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinRequest;
import org.ticketbox.checkin.admission.application.dto.SyncCheckinResponse.SyncResultEntry;
import org.ticketbox.checkin.admission.application.port.CheckinLogRepository;
import org.ticketbox.checkin.admission.application.port.TicketCheckinPort;
import org.ticketbox.checkin.admission.application.port.TicketView;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CheckinSyncHelper {

    private final CheckinLogRepository checkinLogRepository;
    private final TicketCheckinPort ticketCheckinPort;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SyncResultEntry syncSingleEntry(
            SyncCheckinRequest.OfflineLogEntry entry,
            TicketView ticket,
            UUID staffId,
            String deviceId) {
        OffsetDateTime now = OffsetDateTime.now();
        UUID logId = UUID.randomUUID();

        if (!ticketCheckinPort.markAsUsedIfValid(ticket.id(), entry.checkedAt())) {
            var previous = checkinLogRepository.findByTicketId(ticket.id());
            boolean same =
                    previous.filter(
                                    log ->
                                            log.isOffline()
                                                    && staffId.equals(log.getStaffId())
                                                    && deviceId.equals(log.getDeviceId())
                                                    && entry.checkedAt()
                                                            .toInstant()
                                                            .truncatedTo(
                                                                    java.time.temporal.ChronoUnit
                                                                            .MICROS)
                                                            .equals(log.getCheckedAt().toInstant())
                                                    && java.util.Objects.equals(
                                                            entry.gate(), log.getGate())
                                                    && java.util.Objects.equals(
                                                            entry.notes(), log.getNotes()))
                            .isPresent();
            return new SyncResultEntry(
                    entry.qrCode(),
                    same ? "ACCEPTED" : "SKIPPED",
                    same ? "Lượt quét này đã được đồng bộ" : "Vé đã được check-in trên máy chủ");
        }

        int inserted =
                checkinLogRepository.insertOfflineIfAbsent(
                        logId,
                        ticket.id(),
                        ticket.concertId(),
                        staffId,
                        deviceId,
                        entry.checkedAt(),
                        now,
                        entry.gate(),
                        entry.notes());

        if (inserted == 0) {
            return new SyncResultEntry(
                    entry.qrCode(),
                    "SKIPPED",
                    "Vé đã được check-in; bản ghi trên máy chủ được giữ nguyên");
        }

        return new SyncResultEntry(entry.qrCode(), "ACCEPTED", "Đã ghi nhận check-in thành công");
    }
}
