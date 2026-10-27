package com.ticketbox.module.ai.infrastructure;

public record ExtractedPdf(
        String text,
        int pageCount) {
}
