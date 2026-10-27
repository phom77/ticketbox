package com.ticketbox.module.ai.application;

import com.ticketbox.module.ai.domain.ArtistPdfJob;
import com.ticketbox.module.ai.domain.ArtistPdfJobRepository;
import com.ticketbox.module.ai.infrastructure.ArtistPdfFileStorage;
import com.ticketbox.module.concert.ConcertArtistBioPort;
import com.ticketbox.module.concert.ConcertReportingPort;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ArtistBioJobRecoveryTest {

    @Mock private ArtistPdfJobRepository jobRepository;
    @Mock private ArtistPdfFileStorage fileStorage;
    @Mock private ConcertArtistBioPort concertPort;
    @Mock private ConcertReportingPort concertReportingPort;
    @Mock private ApplicationEventPublisher eventPublisher;

    private ArtistBioJobService service;

    @BeforeEach
    void setUp() {
        service = new ArtistBioJobService(
                jobRepository,
                fileStorage,
                concertPort,
                concertReportingPort,
                eventPublisher);
    }

    @Test
    void recoverStalledJobs_RequeuesPendingAndFailsTimedOutProcessingJobs() {
        ArtistPdfJob pending = job();
        ArtistPdfJob processing = job();
        processing.startProcessing();

        when(jobRepository.findByStatusAndCreatedAtBefore(eq(ArtistPdfJob.Status.PENDING), any(OffsetDateTime.class)))
                .thenReturn(List.of(pending));
        when(jobRepository.findByStatusAndStartedAtBefore(eq(ArtistPdfJob.Status.PROCESSING), any(OffsetDateTime.class)))
                .thenReturn(List.of(processing));

        service.recoverStalledJobs();

        verify(eventPublisher).publishEvent(new ArtistBioJobSubmittedEvent(pending.getId()));
        verify(jobRepository).save(processing);
        assertThat(processing.getStatus()).isEqualTo(ArtistPdfJob.Status.FAILED);
        assertThat(processing.getErrorMessage()).contains("quá thời gian");
    }

    private ArtistPdfJob job() {
        ArtistPdfJob job = new ArtistPdfJob(
                UUID.randomUUID(),
                "C:/data/artist.pdf",
                "artist.pdf",
                UUID.randomUUID(),
                UUID.randomUUID().toString().replace("-", ""));
        job.setId(UUID.randomUUID());
        return job;
    }
}
