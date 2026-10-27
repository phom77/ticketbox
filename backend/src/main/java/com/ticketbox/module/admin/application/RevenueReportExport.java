package com.ticketbox.module.admin.application;

public record RevenueReportExport(
        byte[] content,
        String contentType,
        String filename) {
}
