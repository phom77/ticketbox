package com.ticketbox.module.ai.application;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ArtistBioJobEventListener {

    private final ArtistBioJobProcessor processor;

    public ArtistBioJobEventListener(ArtistBioJobProcessor processor) {
        this.processor = processor;
    }

    @Async("artistBioExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSubmitted(ArtistBioJobSubmittedEvent event) {
        processor.process(event.jobId());
    }
}
