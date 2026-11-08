package org.ticketbox.catalog.artistbio.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ticketbox.module.ai.application.ArtistBioJobSubmittedEvent;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.ticketbox.catalog.artistbio.application.port.ArtistPdfJobRepository;
import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;
import org.ticketbox.catalog.artistbio.infrastructure.ArtistPdfFileStorage;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioPort;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@ExtendWith(MockitoExtension.class)
class ArtistBioJobRecoveryTest {

    @Mock private ArtistPdfJobRepository jobRepository;
    @Mock private ArtistPdfFileStorage fileStorage;
    @Mock private ConcertArtistBioPort concertPort;
    @Mock private ApplicationEventPublisher eventPublisher;

    private ArtistBioJobService service;

    @BeforeEach
    void setUp() {
        service =
                new ArtistBioJobService(
                        jobRepository, fileStorage, concertPort, eventPublisher, messages());
    }

    private org.ticketbox.catalog.artistbio.application.port.ArtistBioMessages messages() {
        var source = new org.springframework.context.support.ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        return new org.ticketbox.catalog.artistbio.infrastructure.ArtistBioMessageBundle(
                source, "vi");
    }

    @Test
    void recoverStalledJobs_RequeuesPendingAndFailsTimedOutProcessingJobs() {
        ArtistPdfJob pending = job();
        ArtistPdfJob processing = job();
        processing.startProcessing();

        when(jobRepository.findByStatusAndCreatedAtBefore(
                        eq(ArtistPdfJob.Status.PENDING), any(OffsetDateTime.class)))
                .thenReturn(List.of(pending));
        when(jobRepository.findByStatusAndStartedAtBefore(
                        eq(ArtistPdfJob.Status.PROCESSING), any(OffsetDateTime.class)))
                .thenReturn(List.of(processing));

        service.recoverStalledJobs();

        verify(eventPublisher).publishEvent(new ArtistBioJobSubmittedEvent(pending.getId()));
        verify(jobRepository).save(processing);
        assertThat(processing.getStatus()).isEqualTo(ArtistPdfJob.Status.FAILED);
        assertThat(processing.getErrorMessage()).contains("quá thời gian");
    }

    private ArtistPdfJob job() {
        ArtistPdfJob job =
                new ArtistPdfJob(
                        UUID.randomUUID(),
                        "C:/data/artist.pdf",
                        "artist.pdf",
                        UUID.randomUUID(),
                        UUID.randomUUID().toString().replace("-", ""));
        job.setId(UUID.randomUUID());
        return job;
    }
}
