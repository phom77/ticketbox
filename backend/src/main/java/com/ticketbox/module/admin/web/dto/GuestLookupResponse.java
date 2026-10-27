package com.ticketbox.module.admin.web.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public record GuestLookupResponse(
        boolean found,
        UUID guestId,
        UUID concertId,
        String phone,
        String fullName,
        String category,
        String sponsorName,
        String notes,
        OffsetDateTime checkedInAt,
        String checkinGate
) {
    public static GuestLookupResponse notFound() {
        return new GuestLookupResponse(false, null, null, null, null, null, null, null, null, null);
    }
}
