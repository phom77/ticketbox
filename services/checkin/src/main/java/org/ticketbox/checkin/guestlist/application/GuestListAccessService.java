package org.ticketbox.checkin.guestlist.application;

import org.springframework.stereotype.Service;
import org.ticketbox.checkin.admission.application.port.ConcertAccess;
import org.ticketbox.checkin.application.error.AppException;
import org.ticketbox.checkin.application.error.ErrorCode;

import java.util.UUID;

@Service
public class GuestListAccessService {

    private final ConcertAccess concerts;

    public GuestListAccessService(ConcertAccess concerts) {
        this.concerts = concerts;
    }

    public void requireAccess(UUID concertId, UUID userId, boolean admin) {
        boolean exists = admin ? concerts.exists(concertId) : concerts.isOwnedBy(concertId, userId);
        if (!exists) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found");
        }
    }
}
