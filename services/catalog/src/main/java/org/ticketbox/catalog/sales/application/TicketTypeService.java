package org.ticketbox.catalog.sales.application;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;
import org.ticketbox.catalog.application.port.CatalogCacheKeys;
import org.ticketbox.catalog.application.port.ReadCache;
import org.ticketbox.catalog.concert.application.port.ConcertRepository;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.sales.application.dto.CreateTicketTypeRequest;
import org.ticketbox.catalog.sales.application.dto.TicketTypeAvailabilityResponse;
import org.ticketbox.catalog.sales.application.dto.TicketTypeResponse;
import org.ticketbox.catalog.sales.application.dto.UpdateTicketTypeRequest;
import org.ticketbox.catalog.sales.application.mapper.TicketTypeMapper;
import org.ticketbox.catalog.sales.application.port.CatalogAvailabilityReader;
import org.ticketbox.catalog.sales.application.port.TicketTypeRepository;
import org.ticketbox.catalog.sales.domain.TicketType;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TicketTypeService {

    private final TicketTypeRepository ticketTypeRepository;
    private final ConcertRepository concertRepository;
    private final TicketTypeMapper ticketTypeMapper;
    private final ReadCache readCache;
    private final CatalogAvailabilityReader inventory;

    public List<TicketTypeResponse> getTicketTypes(UUID concertId) {
        verifyConcertExists(concertId);
        return ticketTypeRepository.findByConcertId(concertId).stream()
                .map(ticketTypeMapper::toResponse)
                .toList();
    }

    public List<TicketTypeResponse> getTicketTypesForAdmin(
            UUID concertId, UUID requesterId, boolean isAdmin) {
        Concert concert = getConcertOrThrow(concertId);
        verifyConcertOwnership(concert, requesterId, isAdmin);
        return getTicketTypes(concertId);
    }

    public List<TicketTypeResponse> getActiveTicketTypes(UUID concertId) {
        verifyConcertExists(concertId);
        return ticketTypeRepository.findByConcertIdAndIsActiveTrue(concertId).stream()
                .map(ticketTypeMapper::toResponse)
                .toList();
    }

    private void requirePublicConcert(UUID concertId) {
        concertRepository
                .findByIdAndStatusInAndPublicVisibleTrue(
                        concertId, List.of(Concert.Status.ON_SALE, Concert.Status.SOLD_OUT))
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    @org.ticketbox.catalog.application.query.ReplicaRead
    public List<TicketTypeResponse> getPublicTicketTypes(UUID concertId) {
        return readCache.getList(
                "ticket_types",
                "cache:ticket-types:" + concertId,
                TicketTypeResponse.class,
                Duration.ofSeconds(10),
                () -> {
                    requirePublicConcert(concertId);
                    return ticketTypeRepository.findByConcertIdAndIsActiveTrue(concertId).stream()
                            .map(ticketTypeMapper::toResponse)
                            .toList();
                });
    }

    public TicketTypeAvailabilityResponse getAvailability(UUID concertId) {
        return readCache.get(
                "availability",
                CatalogCacheKeys.CACHE_AVAILABILITY + concertId,
                TicketTypeAvailabilityResponse.class,
                CatalogCacheKeys.TTL_AVAILABILITY,
                () -> {
                    requirePublicConcert(concertId);
                    List<TicketTypeAvailabilityResponse.AvailabilityItem> items =
                            ticketTypeRepository.findByConcertIdAndIsActiveTrue(concertId).stream()
                                    .map(
                                            tt ->
                                                    new TicketTypeAvailabilityResponse
                                                            .AvailabilityItem(
                                                            tt.getId(),
                                                            tt.getName(),
                                                            inventory.available(tt.getId()),
                                                            tt.getTotalQuantity()))
                                    .toList();
                    return new TicketTypeAvailabilityResponse(
                            concertId, items, OffsetDateTime.now());
                });
    }

    @Transactional
    public TicketTypeResponse createTicketType(
            UUID concertId, CreateTicketTypeRequest request, UUID requesterId, boolean isAdmin) {
        Concert concert = lockConcertOrThrow(concertId);
        verifyConcertOwnership(concert, requesterId, isAdmin);
        TicketType ticketType = ticketTypeMapper.toEntity(request);
        ticketType.setConcertId(concertId);
        ticketType.setAvailableQty(request.totalQuantity());
        ticketType.setActive(true);

        TicketType saved = ticketTypeRepository.saveAndFlush(ticketType);
        evictTicketTypeCaches(concertId);
        return ticketTypeMapper.toResponse(saved);
    }

    @Transactional
    public TicketTypeResponse updateTicketType(
            UUID id, UpdateTicketTypeRequest request, UUID requesterId, boolean isAdmin) {
        TicketType ticketType = getTicketTypeOrThrow(id);
        Concert concert = lockConcertOrThrow(ticketType.getConcertId());
        verifyConcertOwnership(concert, requesterId, isAdmin);

        if (inventory.available(id) < ticketType.getTotalQuantity()) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST, "Không thể cập nhật hạng vé sau khi đã bắt đầu bán");
        }

        if (concert.getStatus() != Concert.Status.DRAFT) {
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION,
                    "Chỉ chỉnh sửa cấu hình hạng vé khi concert còn DRAFT");
        }
        ticketTypeMapper.updateTicketTypeFromRequest(request, ticketType);

        TicketType saved = ticketTypeRepository.saveAndFlush(ticketType);
        evictTicketTypeCaches(ticketType.getConcertId());
        return ticketTypeMapper.toResponse(saved);
    }

    @Transactional
    public TicketTypeResponse changeStatus(
            UUID id, boolean isActive, UUID requesterId, boolean isAdmin) {
        TicketType ticketType = getTicketTypeOrThrow(id);
        Concert concert = lockConcertOrThrow(ticketType.getConcertId());
        verifyConcertOwnership(concert, requesterId, isAdmin);
        ticketType.setActive(isActive);
        TicketType saved = ticketTypeRepository.saveAndFlush(ticketType);
        evictTicketTypeCaches(ticketType.getConcertId());
        return ticketTypeMapper.toResponse(saved);
    }

    @Transactional
    public void deleteTicketType(UUID id, UUID requesterId, boolean isAdmin) {
        TicketType ticketType = getTicketTypeOrThrow(id);
        Concert concert = lockConcertOrThrow(ticketType.getConcertId());
        verifyConcertOwnership(concert, requesterId, isAdmin);

        if (inventory.available(id) < ticketType.getTotalQuantity()) {
            throw new AppException(
                    ErrorCode.INVALID_REQUEST, "Không thể xóa hạng vé đã phát sinh bán vé");
        }

        UUID concertId = ticketType.getConcertId();
        ticketTypeRepository.delete(ticketType);
        evictTicketTypeCaches(concertId);
    }

    private Concert lockConcertOrThrow(UUID id) {
        return concertRepository
                .findByIdForUpdate(id)
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    private Concert getConcertOrThrow(UUID concertId) {
        return concertRepository
                .findById(concertId)
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    private TicketType getTicketTypeOrThrow(UUID id) {
        return ticketTypeRepository
                .findById(id)
                .orElseThrow(
                        () ->
                                new AppException(
                                        ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy hạng vé"));
    }

    private void verifyConcertExists(UUID concertId) {
        if (!concertRepository.existsById(concertId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
    }

    private void verifyConcertOwnership(Concert concert, UUID requesterId, boolean isAdmin) {
        if (!isAdmin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(
                    ErrorCode.UNAUTHORIZED, "Bạn không có quyền chỉnh sửa hạng vé của concert này");
        }
    }

    private void evictTicketTypeCaches(UUID concertId) {
        readCache.evictAfterCommit(concertId);
    }
}
