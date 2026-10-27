package com.ticketbox.module.concert.application;

import com.ticketbox.module.concert.web.dto.ConcertSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import java.util.List;

/** Concrete Redis payload; Spring Data's Page interface cannot be deserialized directly. */
public record CachedConcertPage(List<ConcertSummaryResponse> content, long totalElements) {
    public static CachedConcertPage from(Page<ConcertSummaryResponse> page) {
        return new CachedConcertPage(page.getContent(), page.getTotalElements());
    }
    public Page<ConcertSummaryResponse> toPage(Pageable pageable) {
        return new PageImpl<>(content, pageable, totalElements);
    }
}
