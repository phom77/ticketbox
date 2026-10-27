package com.ticketbox.module.checkin.web.dto;

import java.util.List;

public record SyncCheckinResponse(
        int total,
        int accepted,
        int skipped,
        int invalid,
        List<SyncResultEntry> results)
{
        public record SyncResultEntry(
                String qrCode,
                String result,
                String reason) {
        }
}
