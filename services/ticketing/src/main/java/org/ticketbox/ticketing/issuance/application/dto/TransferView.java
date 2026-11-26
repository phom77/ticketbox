package org.ticketbox.ticketing.issuance.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A transfer as one of its two people sees it; the other person is shown by display name only. */
public record TransferView(
        UUID id,
        UUID ticketId,
        UUID orderId,
        String role,
        String status,
        String otherPartyName,
        UUID concertId,
        String concertTitle,
        OffsetDateTime eventDate,
        String ticketTypeName,
        String venueName,
        @JsonInclude(JsonInclude.Include.NON_NULL) String sectionLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String rowLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String seatLabel,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime decidedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID newTicketId) {}
