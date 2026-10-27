package com.ticketbox.module.concert.application;

import com.ticketbox.module.concert.web.dto.ConcertDetailResponse;
import com.ticketbox.module.concert.web.dto.ConcertSeatMapResponse;
import com.ticketbox.module.concert.web.dto.ConcertSummaryResponse;
import com.ticketbox.module.concert.web.dto.CreateConcertRequest;
import com.ticketbox.module.concert.web.dto.UpdateConcertRequest;
import com.ticketbox.module.concert.web.dto.TicketTypeResponse;
import com.ticketbox.module.concert.application.mapper.ConcertMapper;
import com.ticketbox.module.concert.application.mapper.TicketTypeMapper;
import com.ticketbox.module.concert.domain.Concert;
import com.ticketbox.module.concert.domain.ConcertRepository;
import com.ticketbox.module.concert.domain.TicketType;
import com.ticketbox.module.concert.domain.TicketTypeRepository;
import com.ticketbox.module.concert.application.port.PosterStorage;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.util.RedisKeyConstants;
import org.springframework.data.redis.core.RedisTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.infrastructure.redis.RedisReadCache;
import com.ticketbox.shared.util.PublicCatalogCache;
import com.ticketbox.shared.exception.ErrorCode;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ConcertService {

    private final ConcertRepository concertRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final ConcertMapper concertMapper;
    private final TicketTypeMapper ticketTypeMapper;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisReadCache readCache;
    private final PosterStorage posterStorage;

    private static final Map<Concert.Status, Set<Concert.Status>> VALID_TRANSITIONS = Map.of(
            Concert.Status.DRAFT, Set.of(Concert.Status.ON_SALE, Concert.Status.CANCELLED),
            Concert.Status.ON_SALE, Set.of(Concert.Status.SOLD_OUT, Concert.Status.CANCELLED, Concert.Status.COMPLETED),
            Concert.Status.SOLD_OUT, Set.of(Concert.Status.ON_SALE, Concert.Status.CANCELLED, Concert.Status.COMPLETED)
    );

    public ConcertService(ConcertRepository concertRepository, TicketTypeRepository ticketTypeRepository, ConcertMapper concertMapper, TicketTypeMapper ticketTypeMapper, RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, PosterStorage posterStorage, RedisReadCache readCache) {
        this.concertRepository = concertRepository;
        this.ticketTypeRepository = ticketTypeRepository;
        this.concertMapper = concertMapper;
        this.ticketTypeMapper = ticketTypeMapper;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.posterStorage = posterStorage;
        this.readCache = readCache;
    }

    public Page<ConcertSummaryResponse> getPublicConcerts(Pageable pageable) {
        String key = RedisKeyConstants.CACHE_CONCERT_LIST + ":v:" + PublicCatalogCache.listVersion(redisTemplate)
                + ":page:" + pageable.getPageNumber() + ":size:" + pageable.getPageSize() + ":sort:" + pageable.getSort();
        return readCache.get("catalog", key, CachedConcertPage.class, RedisKeyConstants.TTL_CONCERT_LIST,
                () -> CachedConcertPage.from(concertRepository.findByStatusInAndPublicVisibleTrue(
                        List.of(Concert.Status.ON_SALE, Concert.Status.SOLD_OUT), pageable)
                        .map(concertMapper::toSummaryResponse))).toPage(pageable);
    }

    public ConcertDetailResponse getConcertDetail(UUID concertId) {
        return readCache.get("detail", RedisKeyConstants.CACHE_CONCERT_DETAIL + concertId,
                ConcertDetailResponse.class, RedisKeyConstants.TTL_CONCERT_DETAIL,
                () -> composePublicDetail(requirePublicConcert(concertId)));
    }

    private Concert requirePublicConcert(UUID concertId) {
        return concertRepository.findByIdAndStatusInAndPublicVisibleTrue(concertId,
                        List.of(Concert.Status.ON_SALE, Concert.Status.SOLD_OUT))
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    public ConcertDetailResponse getConcertForEdit(UUID concertId, UUID requesterId, boolean isAdmin) {
        Concert concert = concertRepository.findById(concertId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert với ID: " + concertId));
        verifyOwnership(concert, requesterId, isAdmin);
        return composeManagementDetail(concert);
    }

    private ConcertDetailResponse composePublicDetail(Concert concert) {
        List<TicketTypeResponse> ticketTypes = ticketTypeRepository.findByConcertIdAndIsActiveTrue(concert.getId()).stream()
                .map(ticketTypeMapper::toResponse)
                .toList();
        return concertMapper.toDetailResponse(concert).withTicketTypes(ticketTypes);
    }

    /**
     * The concert workspace needs the complete inventory, including ticket types
     * that are currently paused.  Public detail deliberately exposes active
     * types only, so it must not be reused for an organizer/admin workspace.
     */
    private ConcertDetailResponse composeManagementDetail(Concert concert) {
        List<TicketTypeResponse> ticketTypes = ticketTypeRepository.findByConcertId(concert.getId()).stream()
                .sorted(Comparator.comparing(TicketType::getPrice))
                .map(ticketTypeMapper::toResponse)
                .toList();
        return concertMapper.toDetailResponse(concert).withTicketTypes(ticketTypes);
    }

    public ConcertSeatMapResponse getConcertSeatMap(UUID concertId) {
        return readCache.get("seat_map", "cache:seat-map:" + concertId, ConcertSeatMapResponse.class,
                RedisKeyConstants.TTL_CONCERT_DETAIL, () -> {
                    Concert concert = requirePublicConcert(concertId);
                    return new ConcertSeatMapResponse(concert.getId(), concert.getSeatMapSvg());
                });
    }

    public Page<ConcertDetailResponse> getAllConcerts(Concert.Status status, Pageable pageable) {
        Page<Concert> concerts;
        if (status != null) {
            concerts = concertRepository.findByStatus(status, pageable);
        } else {
            concerts = concertRepository.findAll(pageable);
        }
        return concerts.map(concertMapper::toDetailResponse);
    }

    public Page<ConcertDetailResponse> getOwnedConcerts(
            UUID organizerId,
            Concert.Status status,
            Pageable pageable) {
        Page<Concert> concerts = status == null
                ? concertRepository.findByCreatedBy(organizerId, pageable)
                : concertRepository.findByCreatedByAndStatus(organizerId, status, pageable);
        return concerts.map(concertMapper::toDetailResponse);
    }

    @Transactional
    public ConcertDetailResponse createConcert(CreateConcertRequest request, UUID organizerId) {
        validateDates(request.eventDate(), request.doorsOpenAt(), request.saleStartAt(), request.saleEndAt());

        Concert concert = concertMapper.toEntity(request);
        concert.setCreatedBy(organizerId);
        concert.setStatus(Concert.Status.DRAFT);

        Concert saved = concertRepository.save(concert);
        return concertMapper.toDetailResponse(saved);
    }

    @Transactional
    public ConcertDetailResponse updateConcert(UUID id, UpdateConcertRequest request, UUID requesterId, boolean isAdmin) {
        Concert concert = concertRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert với ID: " + id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (concert.getStatus() == Concert.Status.COMPLETED || concert.getStatus() == Concert.Status.CANCELLED) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Không thể cập nhật thông tin concert ở trạng thái " + concert.getStatus());
        }

        validateDates(request.eventDate(), request.doorsOpenAt(), request.saleStartAt(), request.saleEndAt());

        if (concert.getStatus() != Concert.Status.DRAFT &&
                (!java.util.Objects.equals(concert.getSaleStartAt()==null?null:concert.getSaleStartAt().toInstant(), request.saleStartAt().toInstant()) ||
                 !java.util.Objects.equals(concert.getSaleEndAt()==null?null:concert.getSaleEndAt().toInstant(), request.saleEndAt()==null?null:request.saleEndAt().toInstant()))) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "Không thay đổi cửa sổ bán khi concert đã mở bán");
        }
        concertMapper.updateConcertFromRequest(request, concert);

        Concert saved = concertRepository.save(concert);
        evictConcertCaches(id);
        return concertMapper.toDetailResponse(saved);
    }

    @Transactional
    public ConcertDetailResponse changeStatus(UUID id, Concert.Status newStatus, UUID requesterId, boolean isAdmin) {
        Concert concert = concertRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert với ID: " + id));

        verifyOwnership(concert, requesterId, isAdmin);

        validateStatusTransition(concert.getStatus(), newStatus);

        concert.setStatus(newStatus);
        Concert saved = concertRepository.save(concert);
        evictConcertCaches(id);
        return concertMapper.toDetailResponse(saved);
    }

    @Transactional
    public void deleteConcert(UUID id, UUID requesterId, boolean isAdmin) {
        Concert concert = concertRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert với ID: " + id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (concert.getStatus() != Concert.Status.DRAFT) {
            throw new AppException(ErrorCode.CONCERT_NOT_DELETABLE,
                    "Không thể xóa concert ở trạng thái " + concert.getStatus());
        }

        ticketTypeRepository.deleteByConcertId(id);
        concertRepository.delete(concert);
        evictConcertCaches(id);
        String posterPublicId = concert.getPosterPublicId();
        if (posterPublicId != null && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    posterStorage.deleteBestEffort(posterPublicId);
                }
            });
        } else if (posterPublicId != null) {
            posterStorage.deleteBestEffort(posterPublicId);
        }
    }

    @Transactional
    public void updateArtistBio(UUID concertId, String artistBio) {
        Concert concert = concertRepository.findById(concertId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Không tìm thấy concert với ID: " + concertId));
        concert.setArtistBio(artistBio);
        concertRepository.save(concert);
        evictConcertCaches(concertId);
    }

    private void validateDates(
            OffsetDateTime eventDate,
            OffsetDateTime doorsOpenAt,
            OffsetDateTime saleStartAt,
            OffsetDateTime saleEndAt
    ) {
        if (eventDate.isBefore(OffsetDateTime.now())) {
            throw new AppException(ErrorCode.INVALID_DATE, "Ngày diễn phải ở tương lai");
        }
        if (doorsOpenAt != null && doorsOpenAt.isAfter(eventDate)) {
            throw new AppException(ErrorCode.INVALID_DATE, "Thời gian mở cửa phải trước ngày diễn");
        }
        if (saleStartAt == null || saleStartAt.isAfter(eventDate)) {
            throw new AppException(ErrorCode.INVALID_DATE, "Ngày mở bán phải trước hoặc bằng ngày diễn");
        }
        if (saleEndAt != null) {
            if (saleEndAt.isBefore(saleStartAt)) {
                throw new AppException(ErrorCode.INVALID_DATE, "Ngày kết thúc bán phải sau ngày mở bán");
            }
            if (saleEndAt.isAfter(eventDate)) {
                throw new AppException(ErrorCode.INVALID_DATE, "Ngày kết thúc bán phải trước hoặc bằng ngày diễn");
            }
        }
    }

    private void validateStatusTransition(Concert.Status currentStatus, Concert.Status newStatus) {
        if (currentStatus == newStatus) {
            return;
        }
        Set<Concert.Status> allowed = VALID_TRANSITIONS.get(currentStatus);
        if (allowed == null || !allowed.contains(newStatus)) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Không thể chuyển trạng thái concert từ " + currentStatus + " sang " + newStatus);
        }
    }

    private void verifyOwnership(Concert concert, UUID requesterId, boolean isAdmin) {
        if (!isAdmin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Bạn không có quyền chỉnh sửa concert này");
        }
    }

    /**
     * Evicts detail cache for the given concert and all list cache keys.
     * List cache uses page-based keys so we use a pattern delete.
     * Called after any mutation that changes visible concert data.
     */
    void evictConcertCaches(UUID concertId) {
        PublicCatalogCache.evictAfterCommit(redisTemplate, concertId);
    }
}
