package org.ticketbox.catalog.config;

import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.performance.application.PerformanceSalesControls;

/** Resumes organizer sales pauses that are still open when doors open, so they never block Check-in admission. */
@Component
class SalesPauseDoorsResume {
    private final PerformanceSalesControls controls;

    SalesPauseDoorsResume(PerformanceSalesControls controls) {
        this.controls = controls;
    }

    @Scheduled(fixedDelayString = "${ticketbox.sales-pause.interval-ms:2000}")
    public void resumeDue() {
        for (var due : controls.dueAtDoors()) {
            try {
                controls.resumeAtDoors(due);
            } catch (RuntimeException failure) {
                LoggerFactory.getLogger(getClass()).warn("Pause {} will be resumed on the next run", due.id(), failure);
            }
        }
    }
}
