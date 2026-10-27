package com.ticketbox.module.ai.application;

import com.ticketbox.module.ai.domain.ArtistPdfJob;
import com.ticketbox.module.ai.domain.ArtistPdfJobRepository;
import com.ticketbox.module.ai.infrastructure.ArtistPdfFileStorage;
import com.ticketbox.module.concert.ConcertArtistBioPort;
import com.ticketbox.module.concert.ConcertReportingPort;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ArtistBioJobServiceListTest {

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
    void list_OrganizerUsesOwnedConcertIds() {
        UUID organizerId = UUID.randomUUID();
        UUID ownedConcertId = UUID.randomUUID();
        PageRequest pageable = PageRequest.of(0, 20);
        when(concertReportingPort.findConcertIdsOwnedBy(organizerId))
                .thenReturn(List.of(ownedConcertId));
        when(jobRepository.findAll(any(Specification.class), eq(pageable)))
                .thenReturn(Page.empty(pageable));

        var result = service.list(organizerId, false, null, null, pageable);

        assertEquals(0, result.getTotalElements());
        verify(concertReportingPort).findConcertIdsOwnedBy(organizerId);
    }

    @Test
    void list_AdminCanFilterConcertAndStatus() {
        UUID adminId = UUID.randomUUID();
        UUID concertId = UUID.randomUUID();
        PageRequest pageable = PageRequest.of(0, 20);
        ArtistPdfJob job = new ArtistPdfJob(
                concertId,
                "data/artist.pdf",
                "artist.pdf",
                adminId,
                "checksum");
        when(jobRepository.findAll(any(Specification.class), eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(job), pageable, 1));

        var result = service.list(
                adminId,
                true,
                concertId,
                ArtistPdfJob.Status.PENDING,
                pageable);

        assertEquals(1, result.getTotalElements());
        verify(concertPort).requireAccessibleConcert(concertId, adminId, true);
    }
}
