package com.ticketbox.module.ticket.infrastructure;

import com.ticketbox.module.concert.ConcertOrderPort;
import com.ticketbox.module.concert.ConcertView;
import com.ticketbox.module.concert.TicketTypeView;
import com.ticketbox.module.ticket.OrderNotificationItemView;
import com.ticketbox.module.ticket.OrderNotificationView;
import com.ticketbox.module.ticket.OrderPort;
import com.ticketbox.module.ticket.OrderView;
import com.ticketbox.module.ticket.domain.Order;
import com.ticketbox.module.ticket.domain.OrderItem;
import com.ticketbox.module.ticket.domain.OrderItemRepository;
import com.ticketbox.module.ticket.domain.OrderRepository;
import com.ticketbox.shared.exception.AppException;
import com.ticketbox.shared.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class OrderAdapter implements OrderPort {
    private final com.ticketbox.module.ticket.application.PurchaseGuard purchaseGuard;
    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final ConcertOrderPort concertOrderPort;
    private final com.ticketbox.module.inventory.InventoryPort inventory;
    private final com.ticketbox.module.ticket.application.OrderService orderService;

    @Override
    @Transactional
    public Optional<OrderView> lockOrder(UUID orderId) {
        return orderRepository.findByIdForUpdate(orderId).map(this::toOrderView);
    }

    @Override
    @Transactional
    public boolean settlePayment(UUID orderId, String provider, String transactionId) {
        return orderService.handlePaymentSuccess(orderId, provider, transactionId);
    }

    @Override
    public Optional<OrderView> findOrderById(UUID orderId) {
        return orderRepository.findById(orderId)
                .map(this::toOrderView);
    }

    @Override
    @Transactional(noRollbackFor = AppException.class)
    public OrderView getPayableOrderForUser(UUID orderId, UUID userId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        if (!order.getUserId().equals(userId)) {
            // Do not disclose whether another customer's order exists.
            throw new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng");
        }

        if (order.getStatus() != Order.Status.AWAITING_PAYMENT) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Đơn hàng không ở trạng thái có thể thanh toán");
        }

        if (!order.getExpiresAt().isAfter(OffsetDateTime.now())) {
            purchaseGuard.lock(order.getUserId(),order.getConcertId());
            List<OrderItem> items = orderItemRepository.findByOrderId(orderId).stream().sorted(java.util.Comparator.comparing(OrderItem::getTicketTypeId)).toList();
            for (OrderItem item : items) {
                inventory.release(item.getTicketTypeId(), item.getQuantity());
            }
            order.setStatus(Order.Status.EXPIRED);
            orderRepository.save(order);
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Thời hạn thanh toán đơn hàng đã hết");
        }

        return toOrderView(order);
    }

    @Override
    public Optional<OrderNotificationView> findNotificationViewByOrderId(UUID orderId) {
        return orderRepository.findById(orderId).flatMap(order -> {
            ConcertView concert = concertOrderPort.findConcertById(order.getConcertId()).orElse(null);
            if (concert == null) {
                return Optional.empty();
            }

            java.util.List<OrderItem> orderItems = orderItemRepository.findByOrderId(order.getId());
            Map<UUID, String> ticketTypeNames = concertOrderPort
                    .findTicketTypesByIds(orderItems.stream().map(OrderItem::getTicketTypeId).toList())
                    .stream()
                    .collect(Collectors.toMap(TicketTypeView::id, TicketTypeView::name));

            java.util.List<OrderNotificationItemView> items = orderItems.stream()
                    .map(item -> new OrderNotificationItemView(
                            item.getTicketTypeId(),
                            ticketTypeNames.getOrDefault(item.getTicketTypeId(), "Vé"),
                            item.getQuantity(),
                            item.getUnitPrice(),
                            item.getSubtotal()
                    ))
                    .toList();

            return Optional.of(new OrderNotificationView(
                    order.getId(),
                    order.getUserId(),
                    order.getConcertId(),
                    concert.title(),
                    concert.eventDate(),
                    null,
                    order.getTotalAmount(),
                    items
            ));
        });
    }

    @Override
    @Transactional
    public void markPaymentInitiated(UUID orderId, String provider, String providerRef, String paymentUrl) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng"));

        if (order.getStatus() != Order.Status.AWAITING_PAYMENT) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "Đơn hàng không ở trạng thái có thể thanh toán");
        }

        order.setPaymentProvider(Order.PaymentProvider.valueOf(provider));
        order.setPaymentRef(providerRef);
        order.setPaymentUrl(paymentUrl);
        orderRepository.save(order);
    }

    private OrderView toOrderView(Order order) {
        return new OrderView(
                order.getId(),
                order.getUserId(),
                order.getTotalAmount(),
                order.getStatus().name(),
                order.getPaymentProvider() == null ? null : order.getPaymentProvider().name(),
                order.getPaymentRef(),
                order.getPaymentUrl(),
                order.getExpiresAt()
        );
    }
}
