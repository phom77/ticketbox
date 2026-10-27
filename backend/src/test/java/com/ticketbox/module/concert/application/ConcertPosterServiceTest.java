package com.ticketbox.module.concert.application;

import com.ticketbox.module.concert.application.mapper.ConcertMapper;
import com.ticketbox.module.concert.application.port.PosterStorage;
import com.ticketbox.module.concert.application.port.PosterStorage.StoredPoster;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConcertPosterServiceTest {

    @Mock private ConcertRepository concertRepository;
    @Mock private ConcertMapper concertMapper;
    @Mock private PosterStorage posterStorage;
    @Mock private ConcertService concertService;

    private ConcertPosterService service;
    private Concert concert;
    private UUID concertId;
    private UUID ownerId;
    private MockMultipartFile file;

    @BeforeEach
    void setUp() {
        service = new ConcertPosterService(concertRepository, concertMapper, posterStorage, concertService);
        concertId = UUID.randomUUID();
        ownerId = UUID.randomUUID();
        concert = new Concert();
        ReflectionTestUtils.setField(concert, "id", concertId);
        concert.setCreatedBy(ownerId);
        concert.setStatus(Concert.Status.DRAFT);
        file = new MockMultipartFile("file", "poster.jpg", "image/jpeg",
                new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF});
    }

    @Test
    void replacePoster_OwnerStoresCloudinaryResult() {
        OffsetDateTime now = OffsetDateTime.now();
        ConcertDetailResponse response = new ConcertDetailResponse(
                concertId, "Concert", null, null, "Venue", "Address",
                now.plusDays(1), null, null, null, "DRAFT", null,
                "https://cloudinary/poster.jpg", ownerId, now, now);
        when(concertRepository.findById(concertId)).thenReturn(Optional.of(concert));
        when(posterStorage.upload(concertId, file)).thenReturn(
                new StoredPoster("https://cloudinary/poster.jpg", "ticketbox/poster"));
        when(concertMapper.toDetailResponse(concert)).thenReturn(response);

        ConcertDetailResponse result = service.replacePoster(concertId, file, ownerId, false);

        assertEquals(response, result);
        assertEquals("https://cloudinary/poster.jpg", concert.getPosterUrl());
        assertEquals("ticketbox/poster", concert.getPosterPublicId());
        verify(concertRepository).saveAndFlush(concert);
        verify(concertService).evictConcertCaches(concertId);
    }

    @Test
    void replacePoster_DifferentOrganizerIsForbidden() {
        when(concertRepository.findById(concertId)).thenReturn(Optional.of(concert));

        AppException exception = assertThrows(AppException.class,
                () -> service.replacePoster(concertId, file, UUID.randomUUID(), false));

        assertEquals(ErrorCode.UNAUTHORIZED, exception.getErrorCode());
        verify(posterStorage, never()).upload(any(), any());
    }

    @Test
    void removePoster_CompletedConcertIsRejected() {
        concert.setStatus(Concert.Status.COMPLETED);
        when(concertRepository.findById(concertId)).thenReturn(Optional.of(concert));

        AppException exception = assertThrows(AppException.class,
                () -> service.removePoster(concertId, ownerId, false));

        assertEquals(ErrorCode.INVALID_STATUS_TRANSITION, exception.getErrorCode());
        verify(concertRepository, never()).saveAndFlush(any());
    }
}
