package org.ticketbox.ticketing.issuance.application.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;

/** What the ticket page needs to show about transferring one ticket. */
public record TransferState(
        boolean canTransfer,
        @JsonInclude(JsonInclude.Include.NON_NULL) String blockedReason,
        @JsonInclude(JsonInclude.Include.NON_NULL) OffsetDateTime cutoffAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) TransferView pending,
        @JsonInclude(JsonInclude.Include.NON_NULL) String receivedFromName,
        @JsonInclude(JsonInclude.Include.NON_NULL) String transferredToName) {}
