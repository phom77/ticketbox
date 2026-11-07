package org.ticketbox.ticketing.infrastructure.integration.notification;

import lombok.RequiredArgsConstructor;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@RequiredArgsConstructor
public class EventPublicationRecovery {
    @org.springframework.beans.factory.annotation.Value("${ticketbox.events.retry-age-seconds:60}")
    private long retryAgeSeconds = 60;

    private final IncompleteEventPublications publications;

    @Scheduled(fixedDelayString = "${ticketbox.events.recovery-interval-ms:10000}")
    @SchedulerLock(
            name = "eventPublicationRecovery",
            lockAtMostFor = "PT2M",
            lockAtLeastFor = "PT5S")
    public void recover() {
        var count = new AtomicInteger();
        var cutoff = Instant.now().minusSeconds(Math.max(1, retryAgeSeconds));
        publications.resubmitIncompletePublications(
                publication ->
                        publication.getPublicationDate().isBefore(cutoff)
                                && count.getAndIncrement() < 100);
    }
}
