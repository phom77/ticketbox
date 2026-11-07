package org.ticketbox.checkin.guestlist.application.port;

import org.ticketbox.checkin.guestlist.domain.BatchLog;

public interface GuestListJobs {
    void launch(BatchLog batchLog);
}
