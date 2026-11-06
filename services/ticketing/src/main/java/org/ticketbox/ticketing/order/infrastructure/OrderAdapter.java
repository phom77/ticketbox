package org.ticketbox.ticketing.order.infrastructure;

import org.ticketbox.ticketing.integration.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.integration.catalog.ConcertView;
import org.ticketbox.ticketing.integration.catalog.TicketTypeView;
import org.ticketbox.ticketing.order.OrderNotificationItemView;
import org.ticketbox.ticketing.order.OrderNotificationView;
import org.ticketbox.ticketing.order.OrderPort;
import org.ticketbox.ticketing.order.OrderView;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderItem;
import org.ticketbox.ticketing.order.domain.OrderItemRepository;
import org.ticketbox.ticketing.order.domain.OrderRepository;
import org.ticketbox.ticketing.web.AppException;
import org.ticketbox.ticketing.web.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class OrderAdapter implements OrderPort {
    private final org.ticketbox.ticketing.inventory.hold.application.PurchaseGuard purchaseGuard;
    private final OrderRepository orderRepository;
    private final OrderEventStore orderEvents;
    private final OrderItemRepository orderItemRepository;
    private final ConcertOrderPort concertOrderPort;
    private final org.ticketbox.ticketing.inventory.InventoryPort inventory;
    private final org.ticketbox.ticketing.order.application.OrderService orderService;

    @Override
    @Transactional
    public Optional<OrderView> lockOrder(UUID orderId) {
        return orderRepository.findByIdForUpdate(orderId).map(order -> {
            orderEvents.restore(order);
            return toOrderView(order);
        });
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
        long version = orderEvents.restore(order);

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
            orderEvents.record(order, version, OrderEventStore.Transition.OrderExpired);
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
        long version = orderEvents.restore(order);

        if (order.getStatus() != Order.Status.AWAITING_PAYMENT) {
            throw new AppException(ErrorCode.INVALID_STATUS_TRANSITION, "Đơn hàng không ở trạng thái có thể thanh toán");
        }

        Order.PaymentProvider paymentProvider = Order.PaymentProvider.valueOf(provider);
        if (order.getPaymentProvider() == paymentProvider
                && Objects.equals(order.getPaymentRef(), providerRef)
                && Objects.equals(order.getPaymentUrl(), paymentUrl)) {
            return;
        }

        order.setPaymentProvider(paymentProvider);
        order.setPaymentRef(providerRef);
        order.setPaymentUrl(paymentUrl);
        orderEvents.record(order, version, OrderEventStore.Transition.OrderPaymentInitiated);
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
