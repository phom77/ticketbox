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
import org.ticketbox.catalog.concert.application.dto.SalePublication;
import org.ticketbox.catalog.concert.domain.SaleWindow;
import org.ticketbox.catalog.domain.DomainViolation;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
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
    private final org.ticketbox.catalog.concert.application.port.OrganizerDisplayNames organizerNames;

    public ConcertService(
            ConcertRepository concertRepository,
            TicketTypeRepository ticketTypeRepository,
            ConcertMapper concertMapper,
            TicketTypeMapper ticketTypeMapper,
            PosterStorage posterStorage,
            ReadCache readCache,
            org.ticketbox.catalog.concert.application.port.OrganizerDisplayNames organizerNames) {
        this.concertRepository = concertRepository;
        this.ticketTypeRepository = ticketTypeRepository;
        this.concertMapper = concertMapper;
        this.ticketTypeMapper = ticketTypeMapper;
        this.posterStorage = posterStorage;
        this.readCache = readCache;
        this.organizerNames = organizerNames;
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
                () -> {
                    var concert = requirePublicConcert(concertId);
                    var detail = composePublicDetail(concert);
                    if (concert.getOrganizationId() == null) return detail;
                    return organizerNames.find(concert.getOrganizationId()).map(detail::withOrganizationName).orElse(detail);
                });
    }

    private Concert requirePublicConcert(UUID concertId) {
        return concertRepository
                .findByIdAndStatusInAndPublicVisibleTrue(
                        concertId, List.of(Concert.Status.ON_SALE, Concert.Status.SOLD_OUT))
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found"));
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
                                                "error.concert.not-found-by-id",
                                                concertId));
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
                        ? concertRepository.findByOrganizationId(organizerId, pageable)
                        : concertRepository.findByOrganizationIdAndStatus(organizerId, status, pageable);
        return concerts.map(concertMapper::toDetailResponse);
    }

    public Page<ConcertDetailResponse> searchConcerts(
            UUID organizationId, Concert.Status status, String query, Pageable pageable) {
        if (query == null || query.isBlank()) {
            return organizationId == null ? getAllConcerts(status, pageable)
                    : getOwnedConcerts(organizationId, status, pageable);
        }
        return concertRepository.search(organizationId, status, query.strip(), pageable)
                .map(concertMapper::toDetailResponse);
    }

    public ConcertDetailResponse preview(UUID id, UUID organizationId) {
        Concert concert = ownedConcert(id, organizationId, false);
        return composePublicDetail(concert);
    }

    public SalePublication publication(UUID id, UUID organizationId) {
        return publication(ownedConcert(id, organizationId, false));
    }

    @Transactional
    public SalePublication publish(UUID id, UUID organizationId) {
        Concert concert = ownedConcert(id, organizationId, true);
        SalePublication state = publication(concert);
        if (concert.getStatus() == Concert.Status.DRAFT && state.issues().isEmpty()) {
            concert.changeStatus(Concert.Status.ON_SALE);
            concertRepository.saveAndFlush(concert);
            evictConcertCaches(id);
            return publication(concert);
        }
        return state;
    }

    private Concert ownedConcert(UUID id, UUID organizationId, boolean lock) {
        Concert concert = (lock ? concertRepository.findByIdForUpdate(id) : concertRepository.findById(id))
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert-not-found"));
        verifyOwnership(concert, organizationId, false);
        return concert;
    }

    private SalePublication publication(Concert concert) {
        List<String> issues = new ArrayList<>();
        if (concert.getStatus() == Concert.Status.DRAFT) {
            if (blank(concert.getTitle()) || blank(concert.getVenueName()) || blank(concert.getVenueAddress())) {
                issues.add("EVENT_DETAILS");
            }
            OffsetDateTime now = OffsetDateTime.now();
            try {
                new SaleWindow(concert.getEventDate(), concert.getDoorsOpenAt(),
                        concert.getSaleStartAt(), concert.getSaleEndAt()).validate(now);
                if (concert.getSaleEndAt() != null && !concert.getSaleEndAt().isAfter(now)) {
                    issues.add("SALE_WINDOW");
                }
            } catch (DomainViolation violation) {
                issues.add("SALE_WINDOW");
            }
            List<TicketType> tiers = ticketTypeRepository.findByConcertIdAndIsActiveTrue(concert.getId());
            if (tiers.isEmpty() || tiers.stream().anyMatch(tier -> blank(tier.getName())
                    || tier.getTotalQuantity() < 1 || tier.getPrice().signum() < 0
                    || tier.getMaxPerAccount() < 1 || tier.getMaxPerAccount() > tier.getTotalQuantity())) {
                issues.add("ACTIVE_TIER");
            }
        } else if (concert.getStatus() != Concert.Status.ON_SALE && concert.getStatus() != Concert.Status.SOLD_OUT) {
            issues.add("EVENT_STATUS");
        }
        var versions = concertRepository.publication(concert.getId())
                .orElse(new SalePublication.Versions(0, null, 0, 0));
        return new SalePublication(concert.getStatus(), issues, versions);
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    @Transactional
    public ConcertDetailResponse createConcert(CreateConcertRequest request, UUID actorId) {
        return createConcert(request, actorId, null);
    }

    @Transactional
    public ConcertDetailResponse createConcert(
            CreateConcertRequest request, UUID actorId, UUID organizationId) {
        new org.ticketbox.catalog.concert.domain.SaleWindow(
                        request.eventDate(),
                        request.doorsOpenAt(),
                        request.saleStartAt(),
                        request.saleEndAt())
                .validate(OffsetDateTime.now());

        Concert concert = concertMapper.toEntity(request);
        concert.setCreatedBy(actorId);
        if (organizationId != null) {
            concert.assignOrganization(organizationId);
        }
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
                                                "error.concert.not-found-by-id",
                                                id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (concert.isSalesSuspended()) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.use-disruption");
        }
        if (concert.getStatus() == Concert.Status.COMPLETED
                || concert.getStatus() == Concert.Status.CANCELLED) {
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION,
                    "error.concert.status-locked",
                    concert.getStatus());
        }

        new org.ticketbox.catalog.concert.domain.SaleWindow(
                        request.eventDate(),
                        request.doorsOpenAt(),
                        request.saleStartAt(),
                        request.saleEndAt())
                .validate(OffsetDateTime.now());

        if (concert.getStatus() != Concert.Status.DRAFT
                && (!sameInstant(concert.getEventDate(), request.eventDate())
                        || !sameInstant(concert.getDoorsOpenAt(), request.doorsOpenAt()))) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.use-disruption");
        }
        if (concert.getStatus() != Concert.Status.DRAFT
                && (!sameInstant(concert.getSaleStartAt(), request.saleStartAt())
                        || !sameInstant(concert.getSaleEndAt(), request.saleEndAt()))) {
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.sale-window-locked");
        }
        concertMapper.updateConcertFromRequest(request, concert);

        Concert saved = concertRepository.save(concert);
        evictConcertCaches(id);
        return concertMapper.toDetailResponse(saved);
    }

    private static boolean sameInstant(OffsetDateTime stored, OffsetDateTime requested) {
        return Objects.equals(stored == null ? null : stored.toInstant(), requested == null ? null : requested.toInstant());
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
                                                "error.concert.not-found-by-id",
                                                id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (!isAdmin && newStatus == Concert.Status.CANCELLED) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.contact-support-to-cancel");
        }
        if (isAdmin && newStatus == Concert.Status.CANCELLED && concert.getStatus() != Concert.Status.DRAFT
                && concert.getStatus() != Concert.Status.CANCELLED) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.use-disruption");
        }
        if (concert.isSalesSuspended() && concert.getStatus() != newStatus) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.use-disruption");
        }
        if (!isAdmin && concert.getStatus() == Concert.Status.DRAFT && newStatus == Concert.Status.ON_SALE) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "error.concert.use-publication");
        }
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
                                                "error.concert.not-found-by-id",
                                                id));

        verifyOwnership(concert, requesterId, isAdmin);

        if (concert.getStatus() != Concert.Status.DRAFT) {
            throw new AppException(
                    ErrorCode.CONCERT_NOT_DELETABLE,
                    "error.concert.delete-status-locked",
                    concert.getStatus());
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
        if (!isAdmin && !requesterId.equals(concert.getOrganizationId())) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.concert.not-found-by-id", concert.getId());
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
