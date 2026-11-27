package org.ticketbox.checkin.admission.application.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One admission as an organizer sees it. Unlike {@link CheckinHistoryResponse} it carries neither the QR
 * credential nor the scanning device id.
 */
public record OrganizerAdmissionResponse(
        UUID id,
        UUID ticketId,
        UUID concertId,
        UUID staffId,
        OffsetDateTime checkedAt,
        OffsetDateTime syncAt,
        boolean offline,
        String gate,
        String ticketStatus,
        String referenceCode,
        String ticketTypeName) {}
