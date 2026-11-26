package org.ticketbox.ticketing.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.order.application.RefundRequestService;

@Component
public class RefundRequestHandoffSchedule {
    private final RefundRequestService requests;

    public RefundRequestHandoffSchedule(RefundRequestService requests) {
        this.requests = requests;
    }

    @Scheduled(fixedDelayString = "${ticketbox.refund-requests.handoff-delay-ms:60000}")
    public void scheduled() {
        requests.retryHandoffs();
    }
}
