package org.ticketbox.catalog.config;

import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.concert.application.ConcertPublicationReview;

@Component
class ConcertPublicationSchedule {
    private final ConcertPublicationReview review;

    ConcertPublicationSchedule(ConcertPublicationReview review) {
        this.review = review;
    }

    @Scheduled(fixedDelayString = "${ticketbox.publication.interval-ms:2000}")
    public void releaseDue() {
        for (var id : review.due()) {
            try {
                review.release(id);
            } catch (RuntimeException failure) {
                LoggerFactory.getLogger(getClass()).warn("Scheduled concert {} will be retried", id, failure);
            }
        }
    }
}
