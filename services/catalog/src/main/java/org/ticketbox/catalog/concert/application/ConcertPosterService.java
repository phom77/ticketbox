package org.ticketbox.catalog.concert.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.Upload;
import org.ticketbox.catalog.concert.application.dto.ConcertDetailResponse;
import org.ticketbox.catalog.concert.application.mapper.ConcertMapper;
import org.ticketbox.catalog.concert.application.port.ConcertRepository;
import org.ticketbox.catalog.concert.application.port.PosterStorage;
import org.ticketbox.catalog.concert.application.port.PosterStorage.StoredPoster;
import org.ticketbox.catalog.concert.domain.Concert;

import java.util.UUID;

@Service
public class ConcertPosterService {

    private final ConcertRepository concertRepository;
    private final ConcertMapper concertMapper;
    private final PosterStorage posterStorage;
    private final ConcertService concertService;

    public ConcertPosterService(
            ConcertRepository concertRepository,
            ConcertMapper concertMapper,
            PosterStorage posterStorage,
            ConcertService concertService) {
        this.concertRepository = concertRepository;
        this.concertMapper = concertMapper;
        this.posterStorage = posterStorage;
        this.concertService = concertService;
    }

    @Transactional
    public ConcertDetailResponse replacePoster(
            UUID concertId, Upload file, UUID requesterId, boolean isAdmin) {
        Concert concert = editableConcert(concertId, requesterId, isAdmin);
        String previousPublicId = concert.getPosterPublicId();
        StoredPoster uploaded = posterStorage.upload(concertId, file);

        concert.setPosterUrl(uploaded.secureUrl());
        concert.setPosterPublicId(uploaded.publicId());
        concertRepository.saveAndFlush(concert);
        concertService.evictConcertCaches(concertId);

        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            posterStorage.deleteBestEffort(previousPublicId);
            return concertMapper.toDetailResponse(concert);
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        posterStorage.deleteBestEffort(previousPublicId);
                    }

                    @Override
                    public void afterCompletion(int status) {
                        if (status != STATUS_COMMITTED) {
                            posterStorage.deleteBestEffort(uploaded.publicId());
                        }
                    }
                });
        return concertMapper.toDetailResponse(concert);
    }

    @Transactional
    public ConcertDetailResponse removePoster(UUID concertId, UUID requesterId, boolean isAdmin) {
        Concert concert = editableConcert(concertId, requesterId, isAdmin);
        String previousPublicId = concert.getPosterPublicId();

        concert.setPosterUrl(null);
        concert.setPosterPublicId(null);
        concertRepository.saveAndFlush(concert);
        concertService.evictConcertCaches(concertId);
        deleteAfterCommit(previousPublicId);
        return concertMapper.toDetailResponse(concert);
    }

    private Concert editableConcert(UUID concertId, UUID requesterId, boolean isAdmin) {
        Concert concert =
                concertRepository
                        .findById(concertId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "error.concert.not-found-by-id",
                                                concertId));

        if (!isAdmin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "error.concert.edit-forbidden");
        }
        if (concert.getStatus() == Concert.Status.COMPLETED
                || concert.getStatus() == Concert.Status.CANCELLED) {
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION,
                    "error.poster.status-locked",
                    concert.getStatus());
        }
        return concert;
    }

    private void deleteAfterCommit(String publicId) {
        if (publicId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            posterStorage.deleteBestEffort(publicId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        posterStorage.deleteBestEffort(publicId);
                    }
                });
    }
}
