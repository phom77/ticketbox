package com.ticketbox.module.admin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record GuestListEntryResponse(
        UUID id,
        UUID concertId,
        String phone,
        String fullName,
        String category,
        String sponsorName,
        String notes,
        boolean active,
        OffsetDateTime importedAt,
        String batchFile,
        OffsetDateTime checkedInAt,
        String checkinGate) {}
