package org.ticketbox.ticketing.order.application.dto;

import java.util.List;

public record ManagedRefundRequestPage(List<ManagedRefundRequest> content, int page, int size, long totalElements,
        int totalPages) {}
