package org.ticketbox.checkin.guestlist.application;

import org.ticketbox.checkin.integration.catalog.LocalConcertProjection;
import org.ticketbox.checkin.web.AppException;
import org.ticketbox.checkin.web.ErrorCode;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class GuestListAccessService {

    private final LocalConcertProjection concerts;

    public GuestListAccessService(LocalConcertProjection concerts) {
        this.concerts = concerts;
    }

    public void requireAccess(UUID concertId, UUID userId, boolean admin) {
        boolean exists = admin
                ? concerts.exists(concertId)
                : concerts.isOwnedBy(concertId, userId);
        if (!exists) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
    }
}
