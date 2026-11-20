package org.ticketbox.ticketing.config;

import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.performance.application.PerformanceHolds;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock;

@Component
@RequiredArgsConstructor
@Slf4j
class PerformanceHoldSchedule {
    private final PerformanceStock stock;
    private final PerformanceHolds holds;

    @Scheduled(fixedDelayString = "${ticketbox.holds.cleanup-interval-ms:10000}")
    void expire() {
        for (var owner : stock.expiredOwners(OffsetDateTime.now())) {
            try {
                holds.expire(owner);
            } catch (RuntimeException failure) {
                log.warn("Performance hold cleanup will retry", failure);
            }
        }
    }
}
