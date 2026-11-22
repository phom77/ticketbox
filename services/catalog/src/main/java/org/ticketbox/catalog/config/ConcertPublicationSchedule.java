package org.ticketbox.catalog.config;

import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.ticketbox.catalog.concert.application.ConcertPublicationReview;
import org.ticketbox.catalog.performance.application.PerformancePublicationReview;

@Component
class ConcertPublicationSchedule {
    private final ConcertPublicationReview review;

    private final PerformancePublicationReview performances;

    ConcertPublicationSchedule(ConcertPublicationReview review, PerformancePublicationReview performances) {
        this.review = review;
        this.performances = performances;
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
        for (var id : performances.due()) {
            try {
                performances.release(id);
            } catch (RuntimeException failure) {
                LoggerFactory.getLogger(getClass()).warn("Scheduled performance {} will be retried", id, failure);
            }
        }
    }
}
