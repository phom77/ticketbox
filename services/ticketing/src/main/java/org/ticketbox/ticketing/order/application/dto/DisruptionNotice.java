package org.ticketbox.ticketing.order.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;
import java.util.UUID;

/** A postponed or cancelled event that affects the buyer's tickets. */
public record DisruptionNotice(
        UUID concertId,
        String concertTitle,
        String kind,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime newEventDate) {}
