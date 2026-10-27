package com.ticketbox.module.admin.application;

import com.ticketbox.module.concert.ConcertReportingPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class GuestListAccessService {

    private final ConcertReportingPort concertReportingPort;

    public GuestListAccessService(ConcertReportingPort concertReportingPort) {
        this.concertReportingPort = concertReportingPort;
    }

    public void requireAccess(UUID concertId, UUID userId, boolean admin) {
        boolean exists = admin
                ? concertReportingPort.findConcert(concertId).isPresent()
                : concertReportingPort.findOwnedConcert(concertId, userId).isPresent();
        if (!exists) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
    }
}
