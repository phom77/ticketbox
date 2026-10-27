package com.ticketbox.module.checkin.application;

import com.ticketbox.module.checkin.domain.CheckinLogRepository;
import com.ticketbox.module.checkin.web.dto.SyncCheckinRequest;
import com.ticketbox.module.checkin.web.dto.SyncCheckinResponse.SyncResultEntry;
import com.ticketbox.module.ticket.TicketCheckinPort;
import com.ticketbox.module.ticket.TicketView;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

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
            String deviceId
    ) {
        OffsetDateTime now = OffsetDateTime.now();
        UUID logId = UUID.randomUUID();

        if (!ticketCheckinPort.markAsUsedIfValid(ticket.id(), entry.checkedAt())) {
            return new SyncResultEntry(
                    entry.qrCode(),
                    "SKIPPED",
                    "Vé đã được check-in trên máy chủ"
            );
        }

        int inserted = checkinLogRepository.insertOfflineIfAbsent(
                logId,
                ticket.id(),
                ticket.concertId(),
                staffId,
                deviceId,
                entry.checkedAt(),
                now,
                entry.gate(),
                entry.notes()
        );

        if (inserted == 0) {
            return new SyncResultEntry(
                    entry.qrCode(),
                    "SKIPPED",
                    "Vé đã được check-in; bản ghi trên máy chủ được giữ nguyên"
            );
        }

        return new SyncResultEntry(entry.qrCode(), "ACCEPTED", "Đã ghi nhận check-in thành công");
    }
}
