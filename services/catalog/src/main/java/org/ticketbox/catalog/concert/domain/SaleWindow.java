package org.ticketbox.catalog.concert.domain;

import java.time.OffsetDateTime;

public record SaleWindow(
        OffsetDateTime eventDate,
        OffsetDateTime doorsOpenAt,
        OffsetDateTime saleStartAt,
        OffsetDateTime saleEndAt) {
    public void validate(OffsetDateTime now) {
        if (eventDate.isBefore(now)) {
            throw new org.ticketbox.catalog.domain.DomainViolation(
                    "INVALID_DATE", "error.concert.event-date-in-past");
        }
        if (doorsOpenAt != null && doorsOpenAt.isAfter(eventDate)) {
            throw new org.ticketbox.catalog.domain.DomainViolation(
                    "INVALID_DATE", "error.concert.doors-after-event");
        }
        if (saleStartAt == null || saleStartAt.isAfter(eventDate)) {
            throw new org.ticketbox.catalog.domain.DomainViolation(
                    "INVALID_DATE", "error.concert.sale-start-after-event");
        }
        if (saleEndAt != null) {
            if (saleEndAt.isBefore(saleStartAt)) {
                throw new org.ticketbox.catalog.domain.DomainViolation(
                        "INVALID_DATE", "error.concert.sale-end-before-start");
            }
            if (saleEndAt.isAfter(eventDate)) {
                throw new org.ticketbox.catalog.domain.DomainViolation(
                        "INVALID_DATE", "error.concert.sale-end-after-event");
            }
        }
    }
}
