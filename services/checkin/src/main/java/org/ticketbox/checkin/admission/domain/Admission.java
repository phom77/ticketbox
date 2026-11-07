package org.ticketbox.checkin.admission.domain;

import org.ticketbox.checkin.domain.DomainViolation;

import java.util.UUID;

public record Admission(UUID ticketId, UUID concertId) {
    public void requireConcert(UUID requestedConcert) {
        if (!concertId.equals(requestedConcert))
            throw new DomainViolation("INVALID_REQUEST", "Vé không thuộc concert này");
    }

    public CheckinLog acceptedBy(
            UUID staffId, String deviceId, java.time.OffsetDateTime at, String gate) {
        return new CheckinLog(ticketId, concertId, staffId, deviceId, at, false, gate);
    }
}
