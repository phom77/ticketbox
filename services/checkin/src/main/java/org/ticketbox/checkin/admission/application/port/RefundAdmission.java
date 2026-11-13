package org.ticketbox.checkin.admission.application.port;

import java.util.List;
import java.util.UUID;

public interface RefundAdmission {
    enum Decision { HELD, NOT_SYNCED, ALREADY_USED, CONFLICT, RELEASED }

    Decision hold(UUID caseId, List<UUID> ticketIds);

    Decision release(UUID caseId);
}
