package org.ticketbox.catalog.artistbio.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.ticketbox.catalog.artistbio.application.port.ArtistPdfJobRepository;
import org.ticketbox.catalog.artistbio.domain.ArtistPdfJob;
import org.ticketbox.catalog.artistbio.infrastructure.ArtistPdfFileStorage;
import org.ticketbox.catalog.concert.application.port.ConcertArtistBioPort;

import java.util.List;
import java.util.UUID;

@ExtendWith(MockitoExtension.class)
class ArtistBioJobServiceListTest {

    @Mock private ArtistPdfJobRepository jobRepository;
    @Mock private ArtistPdfFileStorage fileStorage;
    @Mock private ConcertArtistBioPort concertPort;
    @Mock private ApplicationEventPublisher eventPublisher;

    private ArtistBioJobService service;

    @BeforeEach
    void setUp() {
        service = new ArtistBioJobService(jobRepository, fileStorage, concertPort, eventPublisher);
    }

    @Test
    void list_OrganizerUsesOwnedConcertIds() {
        UUID organizerId = UUID.randomUUID();
        UUID ownedConcertId = UUID.randomUUID();
        PageRequest pageable = PageRequest.of(0, 20);
        when(concertPort.findConcertIdsOwnedBy(organizerId)).thenReturn(List.of(ownedConcertId));
        when(jobRepository.search(
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        eq(pageable)))
                .thenReturn(Page.empty(pageable));

        var result = service.list(organizerId, false, null, null, pageable);

        assertEquals(0, result.getTotalElements());
        verify(concertPort).findConcertIdsOwnedBy(organizerId);
    }

    @Test
    void list_AdminCanFilterConcertAndStatus() {
        UUID adminId = UUID.randomUUID();
        UUID concertId = UUID.randomUUID();
        PageRequest pageable = PageRequest.of(0, 20);
        ArtistPdfJob job =
                new ArtistPdfJob(concertId, "data/artist.pdf", "artist.pdf", adminId, "checksum");
        when(jobRepository.search(
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any(),
                        eq(pageable)))
                .thenReturn(new PageImpl<>(List.of(job), pageable, 1));

        var result = service.list(adminId, true, concertId, ArtistPdfJob.Status.PENDING, pageable);

        assertEquals(1, result.getTotalElements());
        verify(concertPort).requireAccessibleConcert(concertId, adminId, true);
    }
}
