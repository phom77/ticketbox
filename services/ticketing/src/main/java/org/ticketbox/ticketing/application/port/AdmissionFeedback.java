package org.ticketbox.ticketing.application.port;

import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface AdmissionFeedback {
    record Admission(@NotNull UUID ticketId, @NotNull OffsetDateTime usedAt) {}

    void project(Admission admission);
}
