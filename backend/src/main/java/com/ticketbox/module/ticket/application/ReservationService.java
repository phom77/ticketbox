package com.ticketbox.module.ticket.application;

import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.TicketTypeView;
import com.ticketbox.module.queue.QueueAccessPort;
import com.ticketbox.module.ticket.domain.Order;
import com.ticketbox.module.ticket.domain.OrderItemRepository;
import com.ticketbox.module.ticket.domain.TicketHold;
import com.ticketbox.module.ticket.domain.TicketHoldRepository;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import com.ticketbox.shared.util.RedisKeyConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class ReservationService {

    private final PurchaseGuard purchaseGuard;
    private final TicketHoldRepository ticketHoldRepository;
    private final OrderItemRepository orderItemRepository;
    private final ConcertOrderPort concertOrderPort;
    private final com.ticketbox.module.inventory.InventoryPort inventory;
    private final QueueAccessPort queueAccessPort;
    private final StringRedisTemplate redisTemplate;

    private static final Collection<Order.Status> ACTIVE_STATUSES = List.of(Order.Status.AWAITING_PAYMENT, Order.Status.PAID);

    @Transactional
    public TicketHold reserve(UUID concertId, UUID ticketTypeId, int quantityRequest, UUID userId, String queueAccessToken) {
        purchaseGuard.lock(userId, concertId);
        queueAccessPort.validateAccess(concertId, userId, queueAccessToken);

        String sessionKey = RedisKeyConstants.QUEUE_SESSION + concertId + ":" + userId;
        Long expireSeconds = redisTemplate.getExpire(sessionKey, TimeUnit.SECONDS);
        if (expireSeconds == null || expireSeconds <= 0) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Phiên mua vé của bạn đã hết hạn");
        }
        OffsetDateTime expiresAt = OffsetDateTime.now().plusSeconds(expireSeconds);

        List<TicketTypeView> ticketTypes = concertOrderPort.findTicketTypesByIds(List.of(ticketTypeId));
        if (ticketTypes.isEmpty()) {
            throw new AppException(ErrorCode.TICKET_TYPE_NOT_IN_CONCERT, "Không tìm thấy hạng vé: " + ticketTypeId);
        }
        TicketTypeView type = ticketTypes.get(0);
        if (!concertId.equals(type.concertId())) {
            throw new AppException(ErrorCode.TICKET_TYPE_NOT_IN_CONCERT, "Hạng vé không thuộc concert này");
        }
        if (!type.isActive()) {
            throw new AppException(ErrorCode.TICKET_TYPE_NOT_IN_CONCERT, "Hạng vé hiện không được mở bán");
        }

        removeStaleHold(userId, concertId, ticketTypeId, queueAccessToken);
        if (quantityRequest < 1) throw new AppException(ErrorCode.INVALID_REQUEST,"Số lượng phải lớn hơn 0");
        int alreadyOrdered = orderItemRepository.sumQuantityByUserIdAndTicketTypeId(userId, ticketTypeId, ACTIVE_STATUSES);
        Optional<TicketHold> existingHoldOpt = ticketHoldRepository.findByUserIdAndConcertIdAndTicketTypeId(userId, concertId, ticketTypeId);
        int alreadyHeld = existingHoldOpt.map(TicketHold::getQuantity).orElse(0);

        if (alreadyOrdered + alreadyHeld + quantityRequest > type.maxPerAccount()) {
            throw new AppException(ErrorCode.TICKET_LIMIT_EXCEEDED,
                    "Bạn đã vượt quá giới hạn giữ vé cho khu vực " + type.name() + " (tối đa: " + type.maxPerAccount() + ")");
        }

        boolean reserved = inventory.reserve(ticketTypeId, quantityRequest);
        if (!reserved) {
            throw new AppException(ErrorCode.TICKET_SOLD_OUT, "Vé đã bán hết cho khu vực " + type.name());
        }

        TicketHold hold;
        if (existingHoldOpt.isPresent()) {
            hold = existingHoldOpt.get();
            hold.setQuantity(hold.getQuantity() + quantityRequest);
            hold.setExpiresAt(expiresAt);
        } else {
            hold = new TicketHold();
            hold.setConcertId(concertId);
            hold.setUserId(userId);
            hold.setTicketTypeId(ticketTypeId);
            hold.setQuantity(quantityRequest);
            hold.setExpiresAt(expiresAt);
        }

        hold.setSessionToken(queueAccessToken);
        return ticketHoldRepository.save(hold);
    }

    @Transactional
    public TicketHold release(UUID concertId, UUID ticketTypeId, int quantityRequest, UUID userId, String queueAccessToken) {
        purchaseGuard.lock(userId, concertId);
        queueAccessPort.validateAccess(concertId, userId, queueAccessToken);

        TicketHold hold = ticketHoldRepository.findByUserIdAndConcertIdAndTicketTypeId(userId, concertId, ticketTypeId)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST, "Không tìm thấy vé đang giữ cho hạng vé này"));

        if (!java.util.Objects.equals(hold.getSessionToken(), queueAccessToken)) {
            throw new AppException(ErrorCode.UNAUTHORIZED,"Vé đang giữ thuộc phiên mua khác");
        }
        if (quantityRequest < 1 || hold.getQuantity() < quantityRequest) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Không thể bỏ giữ nhiều vé hơn số vé đang giữ");
        }

        inventory.release(ticketTypeId, quantityRequest);

        int newQty = hold.getQuantity() - quantityRequest;
        if (newQty <= 0) {
            ticketHoldRepository.delete(hold);
            hold.setQuantity(0);
            return hold;
        } else {
            hold.setQuantity(newQty);
            return ticketHoldRepository.save(hold);
        }
    }

    public List<TicketHold> getCurrentHolds(UUID concertId, UUID userId, String queueAccessToken) {
        queueAccessPort.validateAccess(concertId, userId, queueAccessToken);
        return ticketHoldRepository.findByUserIdAndConcertId(userId, concertId).stream()
                .filter(hold -> hold.getExpiresAt().isAfter(OffsetDateTime.now()) && queueAccessToken.equals(hold.getSessionToken())).toList();
    }

    @Transactional
    public void releaseAllCurrentHolds(UUID concertId, UUID userId, String queueAccessToken) {
        purchaseGuard.lock(userId, concertId);
        queueAccessPort.validateAccess(concertId, userId, queueAccessToken);
        releaseAllHoldsForUserAndConcert(userId, concertId);
    }

    @Transactional
    public void cleanupExpiredHoldsForOwner(UUID userId, UUID concertId) {
        purchaseGuard.lock(userId, concertId);
        var now=OffsetDateTime.now();
        for (TicketHold hold : sortedHolds(userId,concertId)) {
            if (!hold.getExpiresAt().isAfter(now)) releaseAndDelete(hold);
        }
    }

    @Transactional
    public void releaseAllHoldsForUserAndConcert(UUID userId, UUID concertId) {
        purchaseGuard.lock(userId,concertId);
        for (TicketHold hold : sortedHolds(userId,concertId)) releaseAndDelete(hold);
    }

    @Transactional
    public void releaseHoldsForSession(UUID userId, UUID concertId, String token) {
        if (token == null || token.isBlank()) return;
        purchaseGuard.lock(userId,concertId);
        // A waiting-room leave has no shopping token and cannot own any hold.
        for (TicketHold hold : sortedHolds(userId,concertId)) {
            if (token != null && token.equals(hold.getSessionToken())) releaseAndDelete(hold);
        }
    }

    private void removeStaleHold(UUID userId, UUID concertId, UUID ticketTypeId, String token) {
        // Reserve touches one SKU only; the worker releases other stale SKUs in sorted order.
        ticketHoldRepository.findByUserIdAndConcertIdAndTicketTypeId(userId,concertId,ticketTypeId)
                .filter(hold -> !hold.getExpiresAt().isAfter(OffsetDateTime.now()) || !token.equals(hold.getSessionToken()))
                .ifPresent(this::releaseAndDelete);
        ticketHoldRepository.flush();
    }
    private List<TicketHold> sortedHolds(UUID userId, UUID concertId) {
        return ticketHoldRepository.findByUserIdAndConcertId(userId,concertId).stream()
                .sorted(java.util.Comparator.comparing(TicketHold::getTicketTypeId)).toList();
    }
    private void releaseAndDelete(TicketHold hold) {
        inventory.release(hold.getTicketTypeId(),hold.getQuantity());
        ticketHoldRepository.delete(hold);
    }
}
