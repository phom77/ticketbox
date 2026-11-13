package org.ticketbox.catalog.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.ticketbox.catalog.concert.application.port.EventDisruptionImpact;
import org.ticketbox.catalog.concert.application.port.EventDisruptionStore;

@Component
class EventDisruptionDispatch {
    private final EventDisruptionStore store;
    private final EventDisruptionImpact impact;

    EventDisruptionDispatch(EventDisruptionStore store, EventDisruptionImpact impact) {
        this.store = store;
        this.impact = impact;
    }

    @Scheduled(fixedDelayString = "${split.disruption-interval-ms:3000}")
    public void dispatch() {
        for (var operation : store.readyToDispatch()) {
            try {
                impact.register(operation);
                store.dispatched(operation.id());
            } catch (RestClientException unavailable) {
                // The operation stays eligible until Ticketing records it.
            }
        }
    }
}
