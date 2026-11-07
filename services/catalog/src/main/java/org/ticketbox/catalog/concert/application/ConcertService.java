package org.ticketbox.catalog.concert.application;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.CatalogCacheKeys;
import org.ticketbox.catalog.application.port.ReadCache;
import org.ticketbox.catalog.concert.application.dto.ConcertDetailResponse;
import org.ticketbox.catalog.concert.application.dto.ConcertSeatMapResponse;
import org.ticketbox.catalog.concert.application.dto.ConcertSummaryResponse;
import org.ticketbox.catalog.concert.application.dto.CreateConcertRequest;
import org.ticketbox.catalog.concert.application.dto.UpdateConcertRequest;
import org.ticketbox.catalog.concert.application.mapper.ConcertMapper;
import org.ticketbox.catalog.concert.application.port.ConcertRepository;
import org.ticketbox.catalog.concert.application.port.PosterStorage;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.sales.application.dto.TicketTypeResponse;
import org.ticketbox.catalog.sales.application.mapper.TicketTypeMapper;
import org.ticketbox.catalog.sales.application.port.TicketTypeRepository;
import org.ticketbox.catalog.sales.domain.TicketType;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ConcertService {

    private final ConcertRepository concertRepository;
    private final TicketTypeRepository ticketTypeRepository;
    private final ConcertMapper concertMapper;
    private final TicketTypeMapper ticketTypeMapper;
    private final ReadCache readCache;
    private final PosterStorage posterStorage;

    public ConcertService(
            ConcertRepository concertRepository,
            TicketTypeRepository ticketTypeRepository,
            ConcertMapper concertMapper,
            TicketTypeMapper ticketTypeMapper,
            PosterStorage posterStorage,
            ReadCache readCache) {
        this.concertRepository = concertRepository;
        this.ticketTypeRepository = ticketTypeRepository;
        this.concertMapper = concertMapper;
        this.ticketTypeMapper = ticketTypeMapper;
        this.posterStorage = posterStorage;
        this.readCache = readCache;
    }

    @org.ticketbox.catalog.application.query.ReplicaRead
    public Page<ConcertSummaryResponse> getPublicConcerts(Pageable pageable) {
        String key =
                CatalogCacheKeys.CACHE_CONCERT_LIST
                        + ":v:"
                        + readCache.listVersion()
                        + ":page:"
                        + pageable.getPageNumber()
                        + ":size:"
                        + pageable.getPageSize()
                        + ":sort:"
                        + pageable.getSort();
        return readCache
                .get(
                        "catalog",
                        key,
                        CachedConcertPage.class,
                        CatalogCacheKeys.TTL_CONCERT_LIST,
                        () ->
                                CachedConcertPage.from(
                                        concertRepository
                                                .findByStatusInAndPublicVisibleTrue(
                                                        List.of(
                                                                Concert.Status.ON_SALE,
                                                                Concert.Status.SOLD_OUT),
                                                        pageable)
                                                .map(concertMapper::toSummaryResponse)))
                .toPage(pageable);
    }

    @org.ticketbox.catalog.application.query.ReplicaRead
    public ConcertDetailResponse getConcertDetail(UUID concertId) {
        return readCache.get(
                "detail",
                CatalogCacheKeys.CACHE_CONCERT_DETAIL + concertId,
                ConcertDetailResponse.class,
                CatalogCacheKeys.TTL_CONCERT_DETAIL,
                () -> composePublicDetail(requirePublicConcert(concertId)));
    }

    private Concert requirePublicConcert(UUID concertId) {
        return concertRepository
                .findByIdAndStatusInAndPublicVisibleTrue(
                        concertId, List.of(Concert.Status.ON_SALE, Concert.Status.SOLD_OUT))
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    public ConcertDetailResponse getConcertForEdit(
            UUID concertId, UUID requesterId, boolean isAdmin) {
        Concert concert =
                concertRepository
                        .findById(concertId)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "Không tìm thấy concert với ID: " + concertId));
        verifyOwnership(concert, requesterId, isAdmin);
        return composeManagementDetail(concert);
    }

    private ConcertDetailResponse composePublicDetail(Concert concert) {
        List<TicketTypeResponse> ticketTypes =
                ticketTypeRepository.findByConcertIdAndIsActiveTrue(concert.getId()).stream()
                        .map(ticketTypeMapper::toResponse)
                        .toList();
        return concertMapper.toDetailResponse(concert).withTicketTypes(ticketTypes);
    }

    /**
     * The concert workspace needs the complete inventory, including ticket types that are currently
     * paused. Public detail deliberately exposes active types only, so it must not be reused for an
     * organizer/admin workspace.
     */
    private ConcertDetailResponse composeManagementDetail(Concert concert) {
        List<TicketTypeResponse> ticketTypes =
                ticketTypeRepository.findByConcertId(concert.getId()).stream()
                        .sorted(Comparator.comparing(TicketType::getPrice))
                        .map(ticketTypeMapper::toResponse)
                        .toList();
        return concertMapper.toDetailResponse(concert).withTicketTypes(ticketTypes);
    }

    @org.ticketbox.catalog.application.query.ReplicaRead
    public ConcertSeatMapResponse getConcertSeatMap(UUID concertId) {
        return readCache.get(
                "seat_map",
                "cache:seat-map:" + concertId,
                ConcertSeatMapResponse.class,
                CatalogCacheKeys.TTL_CONCERT_DETAIL,
                () -> {
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
            UUID organizerId, Concert.Status status, Pageable pageable) {
        Page<Concert> concerts =
                status == null
                        ? concertRepository.findByCreatedBy(organizerId, pageable)
                        : concertRepository.findByCreatedByAndStatus(organizerId, status, pageable);
        return concerts.map(concertMapper::toDetailResponse);
    }

    @Transactional
    public ConcertDetailResponse createConcert(CreateConcertRequest request, UUID organizerId) {
        new org.ticketbox.catalog.concert.domain.SaleWindow(
                        request.eventDate(),
                        request.doorsOpenAt(),
                        request.saleStartAt(),
                        request.saleEndAt())
                .validate(OffsetDateTime.now());

        Concert concert = concertMapper.toEntity(request);
        concert.setCreatedBy(organizerId);
        concert.setStatus(Concert.Status.DRAFT);

        Concert saved = concertRepository.save(concert);
        return concertMapper.toDetailResponse(saved);
    }

    @Transactional
    public ConcertDetailResponse updateConcert(
            UUID id, UpdateConcertRequest request, UUID requesterId, boolean isAdmin) {
        Concert concert =
                concertRepository
                        .findByIdForUpdate(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "Không tìm thấy concert với ID: " + id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (concert.getStatus() == Concert.Status.COMPLETED
                || concert.getStatus() == Concert.Status.CANCELLED) {
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION,
                    "Không thể cập nhật thông tin concert ở trạng thái " + concert.getStatus());
        }

        new org.ticketbox.catalog.concert.domain.SaleWindow(
                        request.eventDate(),
                        request.doorsOpenAt(),
                        request.saleStartAt(),
                        request.saleEndAt())
                .validate(OffsetDateTime.now());

        if (concert.getStatus() != Concert.Status.DRAFT
                && (!java.util.Objects.equals(
                                concert.getSaleStartAt() == null
                                        ? null
                                        : concert.getSaleStartAt().toInstant(),
                                request.saleStartAt().toInstant())
                        || !java.util.Objects.equals(
                                concert.getSaleEndAt() == null
                                        ? null
                                        : concert.getSaleEndAt().toInstant(),
                                request.saleEndAt() == null
                                        ? null
                                        : request.saleEndAt().toInstant()))) {
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION,
                    "Không thay đổi cửa sổ bán khi concert đã mở bán");
        }
        concertMapper.updateConcertFromRequest(request, concert);

        Concert saved = concertRepository.save(concert);
        evictConcertCaches(id);
        return concertMapper.toDetailResponse(saved);
    }

    @Transactional
    public ConcertDetailResponse changeStatus(
            UUID id, Concert.Status newStatus, UUID requesterId, boolean isAdmin) {
        Concert concert =
                concertRepository
                        .findByIdForUpdate(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "Không tìm thấy concert với ID: " + id));

        verifyOwnership(concert, requesterId, isAdmin);

        concert.changeStatus(newStatus);
        Concert saved = concertRepository.save(concert);
        evictConcertCaches(id);
        return concertMapper.toDetailResponse(saved);
    }

    @Transactional
    public void deleteConcert(UUID id, UUID requesterId, boolean isAdmin) {
        Concert concert =
                concertRepository
                        .findByIdForUpdate(id)
                        .orElseThrow(
                                () ->
                                        new AppException(
                                                ErrorCode.RESOURCE_NOT_FOUND,
                                                "Không tìm thấy concert với ID: " + id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (concert.getStatus() != Concert.Status.DRAFT) {
            throw new AppException(
                    ErrorCode.CONCERT_NOT_DELETABLE,
                    "Không thể xóa concert ở trạng thái " + concert.getStatus());
        }

        ticketTypeRepository.deleteByConcertId(id);
        concertRepository.delete(concert);
        evictConcertCaches(id);
        String posterPublicId = concert.getPosterPublicId();
        if (posterPublicId != null && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            posterStorage.deleteBestEffort(posterPublicId);
                        }
                    });
        } else if (posterPublicId != null) {
            posterStorage.deleteBestEffort(posterPublicId);
        }
    }

    private void verifyOwnership(Concert concert, UUID requesterId, boolean isAdmin) {
        if (!isAdmin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(
                    ErrorCode.UNAUTHORIZED, "Bạn không có quyền chỉnh sửa concert này");
        }
    }

    /**
     * Evicts detail cache for the given concert and all list cache keys. List cache uses page-based
     * keys so we use a pattern delete. Called after any mutation that changes visible concert data.
     */
    void evictConcertCaches(UUID concertId) {
        readCache.evictAfterCommit(concertId);
    }
}
