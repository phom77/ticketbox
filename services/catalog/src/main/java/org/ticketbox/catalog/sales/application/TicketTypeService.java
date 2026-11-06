package org.ticketbox.catalog.sales.application;

import org.ticketbox.catalog.sales.web.dto.CreateTicketTypeRequest;
import org.ticketbox.catalog.sales.web.dto.TicketTypeAvailabilityResponse;
import org.ticketbox.catalog.sales.web.dto.TicketTypeResponse;
import org.ticketbox.catalog.sales.web.dto.UpdateTicketTypeRequest;
import org.ticketbox.catalog.sales.application.mapper.TicketTypeMapper;
import org.ticketbox.catalog.concert.domain.Concert;
import org.ticketbox.catalog.sales.domain.TicketType;
import org.ticketbox.catalog.concert.domain.ConcertRepository;
import org.ticketbox.catalog.sales.domain.TicketTypeRepository;
import org.ticketbox.catalog.web.AppException;
import org.ticketbox.catalog.web.ErrorCode;
import org.ticketbox.catalog.cache.RedisKeyConstants;
import org.springframework.data.redis.core.RedisTemplate;
import lombok.RequiredArgsConstructor;
import org.ticketbox.catalog.sales.CatalogAvailabilityReader;
import org.ticketbox.catalog.cache.RedisReadCache;
import org.ticketbox.catalog.cache.PublicCatalogCache;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Duration;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
    private final RedisTemplate<String, Object> redisTemplate;
    private final RedisReadCache readCache;
    private final CatalogAvailabilityReader inventory;

    public List<TicketTypeResponse> getTicketTypes(UUID concertId) {
        verifyConcertExists(concertId);
        return ticketTypeRepository.findByConcertId(concertId).stream()
                .map(ticketTypeMapper::toResponse)
                .toList();
    }

    public List<TicketTypeResponse> getTicketTypesForAdmin(UUID concertId, UUID requesterId, boolean isAdmin) {
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
        concertRepository.findByIdAndStatusInAndPublicVisibleTrue(concertId,
                List.of(Concert.Status.ON_SALE, Concert.Status.SOLD_OUT))
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    @org.ticketbox.catalog.persistence.ReplicaRead
    public List<TicketTypeResponse> getPublicTicketTypes(UUID concertId) {
        return readCache.get("ticket_types", "cache:ticket-types:" + concertId,
                new TypeReference<List<TicketTypeResponse>>() {}, Duration.ofSeconds(10), () -> {
                    requirePublicConcert(concertId);
                    return ticketTypeRepository.findByConcertIdAndIsActiveTrue(concertId).stream()
                            .map(ticketTypeMapper::toResponse).toList();
                });
    }

    public TicketTypeAvailabilityResponse getAvailability(UUID concertId) {
        return readCache.get("availability", RedisKeyConstants.CACHE_AVAILABILITY + concertId,
                TicketTypeAvailabilityResponse.class, RedisKeyConstants.TTL_AVAILABILITY, () -> {
                    requirePublicConcert(concertId);
                    List<TicketTypeAvailabilityResponse.AvailabilityItem> items = ticketTypeRepository
                            .findByConcertIdAndIsActiveTrue(concertId).stream()
                            .map(tt -> new TicketTypeAvailabilityResponse.AvailabilityItem(
                                    tt.getId(), tt.getName(), inventory.available(tt.getId()), tt.getTotalQuantity())).toList();
                    return new TicketTypeAvailabilityResponse(concertId, items, OffsetDateTime.now());
                });
    }

    @Transactional
    public TicketTypeResponse createTicketType(UUID concertId, CreateTicketTypeRequest request, UUID requesterId, boolean isAdmin) {
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
    public TicketTypeResponse updateTicketType(UUID id, UpdateTicketTypeRequest request, UUID requesterId, boolean isAdmin) {
        TicketType ticketType = getTicketTypeOrThrow(id);
        Concert concert = lockConcertOrThrow(ticketType.getConcertId());
        verifyConcertOwnership(concert, requesterId, isAdmin);

        if (inventory.available(id) < ticketType.getTotalQuantity()) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Không thể cập nhật hạng vé sau khi đã bắt đầu bán");
        }

        if (concert.getStatus() != Concert.Status.DRAFT) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "Chỉ chỉnh sửa cấu hình hạng vé khi concert còn DRAFT");
        }
        ticketTypeMapper.updateTicketTypeFromRequest(request, ticketType);

        TicketType saved = ticketTypeRepository.saveAndFlush(ticketType);
        evictTicketTypeCaches(ticketType.getConcertId());
        return ticketTypeMapper.toResponse(saved);
    }

    @Transactional
    public TicketTypeResponse changeStatus(UUID id, boolean isActive, UUID requesterId, boolean isAdmin) {
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
            throw new AppException(ErrorCode.INVALID_REQUEST, "Không thể xóa hạng vé đã phát sinh bán vé");
        }

        UUID concertId = ticketType.getConcertId();
        ticketTypeRepository.delete(ticketType);
        evictTicketTypeCaches(concertId);
    }

    private Concert lockConcertOrThrow(UUID id) {
        return concertRepository.findByIdForUpdate(id).orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    private Concert getConcertOrThrow(UUID concertId) {
        return concertRepository.findById(concertId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert"));
    }

    private TicketType getTicketTypeOrThrow(UUID id) {
        return ticketTypeRepository.findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy hạng vé"));
    }

    private void verifyConcertExists(UUID concertId) {
        if (!concertRepository.existsById(concertId)) {
            throw new AppException(ErrorCode.RESOURCE_NOT_FOUND, "Không tìm thấy concert");
        }
    }

    private void verifyConcertOwnership(Concert concert, UUID requesterId, boolean isAdmin) {
        if (!isAdmin && !concert.getCreatedBy().equals(requesterId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Bạn không có quyền chỉnh sửa hạng vé của concert này");
        }
    }

    private void evictTicketTypeCaches(UUID concertId) {
        PublicCatalogCache.evictAfterCommit(redisTemplate, concertId);
    }
}
