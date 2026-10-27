package com.ticketbox.module.admin.web.dto;

import java.util.UUID;

public record GuestListImportResponse(
        UUID batchLogId,
        String status,
        String statusUrl) {}
