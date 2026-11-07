package org.ticketbox.checkin.guestlist.application.dto;

import java.util.UUID;

public record GuestListImportResponse(UUID batchLogId, String status, String statusUrl) {}
