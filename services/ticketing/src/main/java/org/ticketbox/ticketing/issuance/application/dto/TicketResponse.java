package org.ticketbox.ticketing.issuance.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;
import java.util.UUID;

public record TicketResponse(
        UUID id,
        UUID concertId,
        String concertTitle,
        UUID ticketTypeId,
        String ticketTypeName,
        String qrCode,
        String status,
        OffsetDateTime issuedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID performanceId,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID eventId,
        @JsonInclude(JsonInclude.Include.NON_NULL) String performanceVenueName,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime performanceStartsAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) String sectionLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String rowLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String seatLabel,
        @JsonInclude(JsonInclude.Include.NON_NULL) String referenceCode) {}
