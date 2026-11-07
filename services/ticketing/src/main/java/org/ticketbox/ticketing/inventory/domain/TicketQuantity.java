package org.ticketbox.ticketing.inventory.domain;

import org.ticketbox.ticketing.domain.DomainViolation;

public record TicketQuantity(int value) {
    public TicketQuantity {
        if (value <= 0) throw new DomainViolation("INVALID_REQUEST", "Số lượng phải lớn hơn 0");
    }
}
