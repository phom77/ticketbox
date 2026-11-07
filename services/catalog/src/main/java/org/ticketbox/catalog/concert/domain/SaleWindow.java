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
                    "INVALID_DATE", "Ngày diễn phải ở tương lai");
        }
        if (doorsOpenAt != null && doorsOpenAt.isAfter(eventDate)) {
            throw new org.ticketbox.catalog.domain.DomainViolation(
                    "INVALID_DATE", "Thời gian mở cửa phải trước ngày diễn");
        }
        if (saleStartAt == null || saleStartAt.isAfter(eventDate)) {
            throw new org.ticketbox.catalog.domain.DomainViolation(
                    "INVALID_DATE", "Ngày mở bán phải trước hoặc bằng ngày diễn");
        }
        if (saleEndAt != null) {
            if (saleEndAt.isBefore(saleStartAt)) {
                throw new org.ticketbox.catalog.domain.DomainViolation(
                        "INVALID_DATE", "Ngày kết thúc bán phải sau ngày mở bán");
            }
            if (saleEndAt.isAfter(eventDate)) {
                throw new org.ticketbox.catalog.domain.DomainViolation(
                        "INVALID_DATE", "Ngày kết thúc bán phải trước hoặc bằng ngày diễn");
            }
        }
    }
}
