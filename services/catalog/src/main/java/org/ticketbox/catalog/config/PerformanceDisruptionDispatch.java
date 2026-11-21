package org.ticketbox.catalog.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.performance.application.PerformanceDisruptionStore;

@Component
class PerformanceDisruptionDispatch {
    private static final Logger LOG = LoggerFactory.getLogger(PerformanceDisruptionDispatch.class);
    private final PerformanceDisruptionStore store;
    private final EventDisruptionImpact impact;

    PerformanceDisruptionDispatch(PerformanceDisruptionStore store, EventDisruptionImpact impact) {
        this.store = store;
        this.impact = impact;
    }

    @Scheduled(fixedDelayString = "${split.performance-disruption-interval-ms:3000}")
    public void dispatch() {
        for (var operation : store.claimReady()) {
            try {
                impact.register(operation);
                store.dispatched(operation.id());
            } catch (RestClientException unavailable) {
                LOG.warn("Performance disruption {} will retry", operation.id());
            }
        }
    }
}
