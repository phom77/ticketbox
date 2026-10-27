package com.ticketbox.module.ticket.application;

import com.ticketbox.infrastructure.redis.IdempotencyService;

import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.module.concert.TicketTypeView;
import com.ticketbox.module.ticket.application.mapper.OrderMapper;
import com.ticketbox.module.ticket.domain.Order;
import com.ticketbox.module.ticket.domain.OrderItem;
import com.ticketbox.module.ticket.domain.OrderItemRepository;
import com.ticketbox.module.ticket.domain.OrderRepository;
import com.ticketbox.module.ticket.domain.Ticket;
import com.ticketbox.module.ticket.domain.TicketRepository;
import com.ticketbox.module.ticket.application.util.TicketQrGenerator;
import com.ticketbox.module.ticket.web.dto.CreateOrderRequest;
import com.ticketbox.module.ticket.web.dto.OrderItemRequest;
import com.ticketbox.module.ticket.web.dto.OrderItemResponse;
import com.ticketbox.module.ticket.web.dto.OrderResponse;
import com.ticketbox.module.queue.QueueAccessPort;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.DuplicateIdempotencyKeyException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class OrderService {

    private final PurchaseGuard purchaseGuard;
    private final ConcertOrderPort concertOrderPort;
    private final com.ticketbox.module.inventory.InventoryPort inventory;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final OrderMapper orderMapper;
    private final StringRedisTemplate redisTemplate;
    private final TicketRepository ticketRepository;
    private final IdempotencyService idempotencyService;
    private final QueueAccessPort queueAccessPort;
    private final com.ticketbox.module.ticket.domain.TicketHoldRepository ticketHoldRepository;

    private static final RedisScript<Long> RELEASE_LOCK_SCRIPT = RedisScript.of(
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "  return redis.call('del', KEYS[1]) " +
            "else " +
            "  return 0 " +
            "end",
            Long.class);

    private static final List<Order.Status> ACTIVE_STATUSES = List.of(Order.Status.AWAITING_PAYMENT, Order.Status.PAID);
    private static final int EXPIRED_ORDER_BATCH_SIZE = 100;

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request, UUID userId, String idempotencyKey, String queueAccessToken) {
        IdempotencyService.IdempotencyClaim claim =
                idempotencyService.claimOrder(userId, idempotencyKey);

        try {
            orderRepository.findByUserIdAndIdempotencyKey(
                            userId,
                            claim.clientKey()
                    )
                    .ifPresent(existing -> {
                        throw new DuplicateIdempotencyKeyException(claim.clientKey());
                    });

            return createOrderInsideClaim(request, userId, claim, queueAccessToken);
        } catch (RuntimeException ex) {
            idempotencyService.release(claim);
            throw ex;
        }
    }

    private OrderResponse createOrderInsideClaim(
            CreateOrderRequest request,
            UUID userId,
            IdempotencyService.IdempotencyClaim claim,
            String queueAccessToken
    ) {
        String lockKey = "lock:user:" + userId;
        String lockToken = UUID.randomUUID().toString();
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, lockToken, Duration.ofSeconds(5));
        if (Boolean.FALSE.equals(acquired)) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Một yêu cầu khác đang được xử lý. Vui lòng thử lại");
        }

        releaseUserLockAfterTransaction(lockKey, lockToken);

        ConcertView concert = concertOrderPort.findConcertById(request.concertId())
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert"));

        if (!"ON_SALE".equals(concert.status())) {
            throw new AppException(ErrorCode.CONCERT_NOT_ON_SALE, "Concert hiện không mở bán");
        }

        OffsetDateTime now = OffsetDateTime.now();
        if (concert.saleStartAt().isAfter(now)
                || (concert.saleEndAt() != null && concert.saleEndAt().isBefore(now))) {
            throw new AppException(
                    ErrorCode.SALE_NOT_OPEN,
                    "Thời gian bán vé chưa bắt đầu hoặc đã kết thúc cho: " + concert.title()
            );
        }

        purchaseGuard.lock(userId,request.concertId());
        queueAccessPort.validateAccess(request.concertId(), userId, queueAccessToken);
        if (request.items().stream().map(OrderItemRequest::ticketTypeId).distinct().count() != request.items().size()) {
            throw new AppException(ErrorCode.INVALID_REQUEST,"Mỗi hạng vé chỉ được xuất hiện một lần trong đơn");
        }

        List<UUID> ticketTypeIds = request.items().stream()
                .map(OrderItemRequest::ticketTypeId)
                .toList();

        List<TicketTypeView> ticketTypes = concertOrderPort.findTicketTypesByIds(ticketTypeIds);
        Map<UUID, TicketTypeView> typeMap = ticketTypes.stream()
                .collect(Collectors.toMap(TicketTypeView::id, t -> t));

        List<com.ticketbox.module.ticket.domain.TicketHold> userHolds = ticketHoldRepository.findByUserIdAndConcertId(userId, request.concertId());
        userHolds = userHolds.stream().sorted(Comparator.comparing(com.ticketbox.module.ticket.domain.TicketHold::getTicketTypeId)).toList();
        // Combine every stock change before locking inventory rows, including omitted/stale holds.
        // A single UUID order prevents cross-account A->B / B->A deadlocks.
        Map<UUID, Integer> inventoryDeltas = new TreeMap<>();
        for (var hold : userHolds) {
            if (!hold.getExpiresAt().isAfter(now) || !queueAccessToken.equals(hold.getSessionToken()) || !ticketTypeIds.contains(hold.getTicketTypeId())) {
                inventoryDeltas.merge(hold.getTicketTypeId(), hold.getQuantity(), Integer::sum);
            }
        }
        Map<UUID, Integer> holdMap = userHolds.stream()
                .filter(hold -> hold.getExpiresAt().isAfter(now) && queueAccessToken.equals(hold.getSessionToken()) && ticketTypeIds.contains(hold.getTicketTypeId()))
                .collect(Collectors.toMap(com.ticketbox.module.ticket.domain.TicketHold::getTicketTypeId, com.ticketbox.module.ticket.domain.TicketHold::getQuantity));

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<OrderItem> orderItems = new ArrayList<>();

        for (OrderItemRequest itemRequest : request.items().stream().sorted(Comparator.comparing(OrderItemRequest::ticketTypeId)).toList()) {
            TicketTypeView type = typeMap.get(itemRequest.ticketTypeId());

            if (type == null) {
                throw new AppException(
                        ErrorCode.TICKET_TYPE_NOT_IN_CONCERT,
                        "Không tìm thấy hạng vé: " + itemRequest.ticketTypeId()
                );
            }

            if (!request.concertId().equals(type.concertId())) {
                throw new AppException(
                        ErrorCode.TICKET_TYPE_NOT_IN_CONCERT,
                        "Hạng vé không thuộc concert này"
                );
            }

            if (!type.isActive()) {
                throw new AppException(
                        ErrorCode.TICKET_TYPE_NOT_IN_CONCERT,
                        "Hạng vé hiện không được mở bán"
                );
            }

            int alreadyOrdered = orderItemRepository.sumQuantityByUserIdAndTicketTypeId(
                    userId,
                    type.id(),
                    ACTIVE_STATUSES
            );

            int heldQty = holdMap.getOrDefault(type.id(), 0);

            if (alreadyOrdered + itemRequest.quantity() > type.maxPerAccount()) {
                throw new AppException(
                        ErrorCode.TICKET_LIMIT_EXCEEDED,
                        "Bạn đã vượt quá giới hạn mua vé cho khu vực " + type.name()
                                + " (tối đa: " + type.maxPerAccount() + ")"
                );
            }

            if (itemRequest.quantity() < 1) throw new AppException(ErrorCode.INVALID_REQUEST, "Số lượng phải lớn hơn 0");
            inventoryDeltas.merge(type.id(), heldQty - itemRequest.quantity(), Integer::sum);

            BigDecimal unitPrice = type.price();
            BigDecimal subtotal = unitPrice.multiply(BigDecimal.valueOf(itemRequest.quantity()));
            totalAmount = totalAmount.add(subtotal);

            OrderItem orderItem = new OrderItem();
            orderItem.setTicketTypeId(type.id());
            orderItem.setQuantity(itemRequest.quantity());
            orderItem.setUnitPrice(unitPrice);
            orderItem.setSubtotal(subtotal);
            orderItems.add(orderItem);
        }

        for (var delta : inventoryDeltas.entrySet()) {
            if (delta.getValue() > 0) inventory.release(delta.getKey(), delta.getValue());
            else if (delta.getValue() < 0 && !inventory.reserve(delta.getKey(), -delta.getValue())) {
                throw new AppException(ErrorCode.TICKET_SOLD_OUT, "Vé đã bán hết cho hạng vé " + delta.getKey());
            }
        }
        ticketHoldRepository.deleteByUserIdAndConcertId(userId, request.concertId());

        Order order = new Order();
        order.setUserId(userId);
        order.setConcertId(request.concertId());
        order.setStatus(Order.Status.AWAITING_PAYMENT);
        order.setTotalAmount(totalAmount);
        order.setIdempotencyKey(claim.clientKey());
        order.setExpiresAt(now.plusMinutes(15));

        Order savedOrder = orderRepository.save(order);

        for (OrderItem orderItem : orderItems) {
            orderItem.setOrderId(savedOrder.getId());
        }
        orderItemRepository.saveAll(orderItems);

        List<OrderItemResponse> itemResponses = orderItems.stream()
                .map(item -> {
                    String typeName = typeMap.get(item.getTicketTypeId()).name();
                    return orderMapper.toItemResponse(item, typeName);
                })
                .toList();

        OrderResponse response = orderMapper.toResponse(savedOrder, itemResponses, concert.title());

        idempotencyService.completeAfterCommit(claim, savedOrder.getId());
        releaseQueueSlotAfterCommit(request.concertId(), userId, queueAccessToken);
        return response;
    }

    private void releaseQueueSlotAfterCommit(UUID concertId, UUID userId, String token) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try { queueAccessPort.finishShoppingSession(concertId, userId, token); }
                catch (RuntimeException exception) { log.warn("Committed order retained; shopping lease will expire",exception); }
            }
        });
    }

    private void releaseUserLockAfterTransaction(String lockKey, String lockToken) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            redisTemplate.execute(RELEASE_LOCK_SCRIPT, List.of(lockKey), lockToken);
            throw new IllegalStateException("User purchase lock requires an active transaction");
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                try { redisTemplate.execute(RELEASE_LOCK_SCRIPT, List.of(lockKey), lockToken); }
                catch (RuntimeException exception) { log.warn("Purchase cache lock will expire"); }
            }
        });
    }

    public List<OrderResponse> listUserOrders(UUID userId) {
        List<Order> orders = orderRepository.findByUserIdOrderByCreatedAtDesc(userId);
        if (orders.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> orderIds = orders.stream().map(Order::getId).toList();
        List<OrderItem> allItems = orderItemRepository.findByOrderIdIn(orderIds);
        Map<UUID, List<OrderItem>> itemsByOrderId = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        Set<UUID> concertIds = orders.stream().map(Order::getConcertId).collect(Collectors.toSet());
        List<ConcertView> concerts = concertOrderPort.findConcertsByIds(concertIds);
        Map<UUID, String> concertTitles = concerts.stream()
                .collect(Collectors.toMap(ConcertView::id, ConcertView::title));

        Set<UUID> ticketTypeIds = allItems.stream().map(OrderItem::getTicketTypeId).collect(Collectors.toSet());
        List<TicketTypeView> ticketTypes = concertOrderPort.findTicketTypesByIds(ticketTypeIds);
        Map<UUID, String> ticketTypeNames = ticketTypes.stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        return orders.stream().map(order -> {
            List<OrderItem> orderItems = itemsByOrderId.getOrDefault(order.getId(), Collections.emptyList());
            List<OrderItemResponse> itemResponses = orderItems.stream()
                    .map(item -> {
                        String typeName = ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Không rõ hạng vé");
                        return orderMapper.toItemResponse(item, typeName);
                    })
                    .toList();

            String concertTitle = concertTitles.getOrDefault(order.getConcertId(), "Không rõ concert");
            return orderMapper.toResponse(order, itemResponses, concertTitle);
        }).toList();
    }

    public OrderResponse getOrderByIdempotencyKey(String key, UUID userId) {
        if (key == null || key.isBlank() || key.trim().length() > 128) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "Idempotency-Key không hợp lệ");
        }
        Order order = orderRepository.findByUserIdAndIdempotencyKey(userId, key.trim())
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));
        return getOrderDetail(order.getId(), userId);
    }

    public OrderResponse getOrderDetail(UUID id, UUID userId) {
        Order order = orderRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        List<OrderItem> items = orderItemRepository.findByOrderId(order.getId());

        ConcertView concert = concertOrderPort.findConcertById(order.getConcertId())
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert"));

        List<UUID> ticketTypeIds = items.stream().map(OrderItem::getTicketTypeId).toList();
        List<TicketTypeView> ticketTypes = concertOrderPort.findTicketTypesByIds(ticketTypeIds);
        Map<UUID, String> ticketTypeNames = ticketTypes.stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        List<OrderItemResponse> itemResponses = items.stream()
                .map(item -> {
                    String typeName = ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Không rõ hạng vé");
                    return orderMapper.toItemResponse(item, typeName);
                })
                .toList();

        return orderMapper.toResponse(order, itemResponses, concert.title());
    }

    // ---- Admin / Organizer ----

    public List<OrderResponse> listAllOrders(UUID concertId, String status) {
        List<Order> orders;

        if (concertId != null && status != null) {
            Order.Status orderStatus = Order.Status.valueOf(status);
            orders = orderRepository.findByConcertIdOrderByCreatedAtDesc(concertId)
                    .stream()
                    .filter(o -> o.getStatus() == orderStatus)
                    .toList();
        } else if (concertId != null) {
            orders = orderRepository.findByConcertIdOrderByCreatedAtDesc(concertId);
        } else if (status != null) {
            orders = orderRepository.findByStatusOrderByCreatedAtDesc(Order.Status.valueOf(status));
        } else {
            orders = orderRepository.findAllByOrderByCreatedAtDesc();
        }

        return toOrderResponses(orders);
    }

    public List<OrderResponse> listManagedOrders(
            UUID concertId,
            String status,
            UUID requesterId,
            boolean admin) {
        if (admin) {
            return listAllOrders(concertId, status);
        }

        List<UUID> ownedConcertIds = concertOrderPort.findConcertIdsOwnedBy(requesterId);
        if (ownedConcertIds.isEmpty()) {
            return Collections.emptyList();
        }

        List<Order> orders;
        if (concertId != null) {
            requireOwnedConcert(concertId, requesterId);
            orders = orderRepository.findByConcertIdOrderByCreatedAtDesc(concertId);
            if (status != null) {
                Order.Status orderStatus = Order.Status.valueOf(status);
                orders = orders.stream()
                        .filter(order -> order.getStatus() == orderStatus)
                        .toList();
            }
        } else if (status != null) {
            orders = orderRepository.findByConcertIdInAndStatusOrderByCreatedAtDesc(
                    ownedConcertIds,
                    Order.Status.valueOf(status));
        } else {
            orders = orderRepository.findByConcertIdInOrderByCreatedAtDesc(ownedConcertIds);
        }

        return toOrderResponses(orders);
    }

    private List<OrderResponse> toOrderResponses(List<Order> orders) {
        if (orders.isEmpty()) return Collections.emptyList();

        List<UUID> orderIds = orders.stream().map(Order::getId).toList();
        List<OrderItem> allItems = orderItemRepository.findByOrderIdIn(orderIds);
        Map<UUID, List<OrderItem>> itemsByOrderId = allItems.stream()
                .collect(Collectors.groupingBy(OrderItem::getOrderId));

        Set<UUID> concertIds = orders.stream().map(Order::getConcertId).collect(Collectors.toSet());
        Map<UUID, String> concertTitles = concertOrderPort.findConcertsByIds(concertIds).stream()
                .collect(Collectors.toMap(ConcertView::id, ConcertView::title));

        Set<UUID> ticketTypeIds = allItems.stream().map(OrderItem::getTicketTypeId).collect(Collectors.toSet());
        Map<UUID, String> ticketTypeNames = concertOrderPort.findTicketTypesByIds(ticketTypeIds).stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        return orders.stream().map(order -> {
            List<OrderItem> items = itemsByOrderId.getOrDefault(order.getId(), Collections.emptyList());
            List<OrderItemResponse> itemResponses = items.stream()
                    .map(item -> orderMapper.toItemResponse(item, ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Không rõ hạng vé")))
                    .toList();
            return orderMapper.toResponse(order, itemResponses, concertTitles.getOrDefault(order.getConcertId(), "Không rõ concert"));
        }).toList();
    }

    public OrderResponse getAdminOrderDetail(UUID orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        List<OrderItem> items = orderItemRepository.findByOrderId(order.getId());

        ConcertView concert = concertOrderPort.findConcertById(order.getConcertId())
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert"));

        List<UUID> ticketTypeIds = items.stream().map(OrderItem::getTicketTypeId).toList();
        Map<UUID, String> ticketTypeNames = concertOrderPort.findTicketTypesByIds(ticketTypeIds).stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        List<OrderItemResponse> itemResponses = items.stream()
                .map(item -> orderMapper.toItemResponse(item, ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Không rõ hạng vé")))
                .toList();

        return orderMapper.toResponse(order, itemResponses, concert.title());
    }

    public OrderResponse getManagedOrderDetail(UUID orderId, UUID requesterId, boolean admin) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));
        if (!admin) {
            requireOwnedConcert(order.getConcertId(), requesterId);
        }
        return toOrderResponse(order);
    }

    private OrderResponse toOrderResponse(Order order) {
        List<OrderItem> items = orderItemRepository.findByOrderId(order.getId());

        ConcertView concert = concertOrderPort.findConcertById(order.getConcertId())
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert"));

        List<UUID> ticketTypeIds = items.stream().map(OrderItem::getTicketTypeId).toList();
        Map<UUID, String> ticketTypeNames = concertOrderPort.findTicketTypesByIds(ticketTypeIds).stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        List<OrderItemResponse> itemResponses = items.stream()
                .map(item -> orderMapper.toItemResponse(item, ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Không rõ hạng vé")))
                .toList();

        return orderMapper.toResponse(order, itemResponses, concert.title());
    }

    private void requireOwnedConcert(UUID concertId, UUID organizerId) {
        if (!concertOrderPort.isConcertOwnedBy(concertId, organizerId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED, "Bạn không quản lý concert này");
        }
    }

    public OrderResponse retryPayment(UUID orderId, UUID userId) {
        Order order = orderRepository.findByIdAndUserId(orderId, userId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        if (order.getStatus() != Order.Status.AWAITING_PAYMENT) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Chỉ có thể thanh toán lại đơn đang chờ thanh toán. Trạng thái hiện tại: " + order.getStatus());
        }

        if (order.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "Thời hạn thanh toán đơn hàng đã hết");
        }

        return toOrderResponse(order);
    }

    @Transactional
    public OrderResponse cancelOrder(UUID orderId, UUID userId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        if (!order.getUserId().equals(userId)) {
            throw new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
        }

        if (order.getStatus() != Order.Status.AWAITING_PAYMENT) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Chỉ có thể hủy đơn đang chờ thanh toán. Trạng thái hiện tại: " + order.getStatus());
        }

        purchaseGuard.lock(order.getUserId(),order.getConcertId());
        List<OrderItem> items = orderItemRepository.findByOrderId(orderId).stream().sorted(Comparator.comparing(OrderItem::getTicketTypeId)).toList();
        for (OrderItem item : items) {
            inventory.release(item.getTicketTypeId(), item.getQuantity());
        }

        order.setStatus(Order.Status.CANCELLED);
        orderRepository.save(order);
        log.info("Order {} cancelled by user {}, released {} item type(s) back to inventory",
                orderId, userId, items.size());

        Set<UUID> ticketTypeIds = items.stream().map(OrderItem::getTicketTypeId).collect(Collectors.toSet());
        List<TicketTypeView> ticketTypes = concertOrderPort.findTicketTypesByIds(ticketTypeIds);
        Map<UUID, String> ticketTypeNames = ticketTypes.stream()
                .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

        ConcertView concert = concertOrderPort.findConcertById(order.getConcertId())
                .orElseThrow(() -> new AppException(ErrorCode.CONCERT_NOT_FOUND, "Không tìm thấy concert"));

        List<OrderItemResponse> itemResponses = items.stream()
                .map(item -> {
                    String typeName = ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Không rõ hạng vé");
                    return orderMapper.toItemResponse(item, typeName);
                })
                .toList();

        return orderMapper.toResponse(order, itemResponses, concert.title());
    }

    @Transactional
    public boolean expireOrderIfDue(UUID orderId) {
        Order order=orderRepository.findByIdForUpdate(orderId).orElse(null);
        if (order == null || order.getStatus()!=Order.Status.AWAITING_PAYMENT || order.getExpiresAt().isAfter(OffsetDateTime.now())) return false;
        purchaseGuard.lock(order.getUserId(),order.getConcertId());
        for (OrderItem item : orderItemRepository.findByOrderId(orderId).stream().sorted(Comparator.comparing(OrderItem::getTicketTypeId)).toList()) {
            inventory.release(item.getTicketTypeId(),item.getQuantity());
        }
        order.setStatus(Order.Status.EXPIRED); orderRepository.save(order); return true;
    }

    @Transactional
    public boolean handlePaymentSuccess(UUID orderId, String provider, String providerRef) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        if (order.getStatus() == Order.Status.PAID) {
            return true;
        }

        if (order.getStatus() != Order.Status.AWAITING_PAYMENT) {
            return false;
        }

        if (!order.getExpiresAt().isAfter(OffsetDateTime.now())) {
            purchaseGuard.lock(order.getUserId(),order.getConcertId());
            for (OrderItem item : orderItemRepository.findByOrderId(orderId).stream().sorted(Comparator.comparing(OrderItem::getTicketTypeId)).toList()) {
                inventory.release(item.getTicketTypeId(), item.getQuantity());
            }
            order.setStatus(Order.Status.EXPIRED);
            orderRepository.save(order);
            return false;
        }

        order.setStatus(Order.Status.PAID);
        order.setPaidAt(OffsetDateTime.now());
        order.setPaymentProvider(Order.PaymentProvider.valueOf(provider));
        order.setPaymentRef(providerRef);
        orderRepository.save(order);

        List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
        List<Ticket> ticketsToSave = new ArrayList<>();

        for (OrderItem item : items) {
            for (int i = 0; i < item.getQuantity(); i++) {
                Ticket ticket = new Ticket();
                ticket.setOrderItemId(item.getId());
                ticket.setTicketTypeId(item.getTicketTypeId());
                ticket.setConcertId(order.getConcertId());
                ticket.setUserId(order.getUserId());
                ticket.setStatus(Ticket.Status.VALID);
                
                String qrSecret = UUID.randomUUID().toString();
                ticket.setQrSecret(qrSecret);

                String qrCode = TicketQrGenerator.generateQrToken(
                        ticket.getConcertId(),
                        ticket.getTicketTypeId(),
                        ticket.getUserId(),
                        qrSecret
                );
                ticket.setQrCode(qrCode);
                
                ticketsToSave.add(ticket);
            }
        }
        ticketRepository.saveAll(ticketsToSave);
        return true;
    }
}
