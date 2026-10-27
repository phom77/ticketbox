package com.ticketbox.module.concert.application;

import com.ticketbox.module.concert.application.mapper.ConcertMapper;
import com.ticketbox.module.concert.application.port.PosterStorage;
import com.ticketbox.module.concert.application.port.PosterStorage.StoredPoster;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

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
            ConcertService concertService
    ) {
        this.concertRepository = concertRepository;
        this.concertMapper = concertMapper;
        this.posterStorage = posterStorage;
        this.concertService = concertService;
    }

    @Transactional
    public ConcertDetailResponse replacePoster(
            UUID concertId,
            MultipartFile file,
            UUID requesterId,
            boolean isAdmin
    ) {
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
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
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
        Concert concert = concertRepository.findById(concertId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert với ID: " + concertId));

        if (!isAdmin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Bạn không có quyền chỉnh sửa concert này");
        }
        if (concert.getStatus() == Concert.Status.COMPLETED || concert.getStatus() == Concert.Status.CANCELLED) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Không thể cập nhật poster concert ở trạng thái " + concert.getStatus());
        }
        return concert;
    }

    private void deleteAfterCommit(String publicId) {
        if (publicId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            posterStorage.deleteBestEffort(publicId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                posterStorage.deleteBestEffort(publicId);
            }
        });
    }
}
