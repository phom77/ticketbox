package org.ticketbox.ticketing.infrastructure.integration.payment;

import lombok.RequiredArgsConstructor;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.ticketbox.ticketing.application.port.payment.PaymentWorkflowPort;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth.Path;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "ticketbox.payments.mode", havingValue = "remote")
public class PaymentIntentDispatcher {
    private final PaymentWorkflowPort workflow;
    private final PaymentRemoteClient remote;
    private final AdmissionHealth health;

    @Scheduled(fixedDelayString = "${ticketbox.payments.dispatch-interval-ms:1000}")
    public void dispatch() {
        for (var claim : workflow.claim(2))
            try {
                workflow.snapshot(claim, remote.submit(claim.intent()));
                health.record(null, Path.PAYMENT, false, false, false);
            } catch (RuntimeException error) {
                if (!(error instanceof HttpStatusCodeException http)
                        || http.getStatusCode().is5xxServerError() || http.getStatusCode().value() == 429) {
                    boolean unavailable = error instanceof ResourceAccessException
                            || error instanceof HttpStatusCodeException http
                            && (http.getStatusCode().value() == 429 || http.getStatusCode().value() == 503);
                    health.record(null, Path.PAYMENT, false, true, unavailable);
                }
                workflow.failed(claim, error.getClass().getSimpleName());
            }
    }
}
