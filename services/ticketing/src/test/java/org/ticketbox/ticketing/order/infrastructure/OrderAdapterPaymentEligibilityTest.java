package org.ticketbox.ticketing.order.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.order.application.port.OrderItemRepository;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderItem;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ExtendWith(MockitoExtension.class)
class OrderAdapterPaymentEligibilityTest {

    @Mock private OrderRepository orderRepository;
    @Mock private OrderItemRepository orderItemRepository;
    @Mock private ConcertOrderPort concertOrderPort;

    @Mock private org.ticketbox.ticketing.inventory.hold.infrastructure.PurchaseGuard purchaseGuard;

    @Mock private org.ticketbox.ticketing.inventory.application.port.InventoryPort inventory;

    @Mock private org.ticketbox.ticketing.order.infrastructure.OrderEventStore orderEvents;

    @InjectMocks private OrderAdapter orderAdapter;

    @Test
    void expiresAnOverdueOrderAndReleasesItsInventoryBeforeRejectingPayment() {
        UUID orderId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID ticketTypeId = UUID.randomUUID();
        Order order = awaitingPaymentOrder(orderId, userId, OffsetDateTime.now().minusSeconds(1));
        OrderItem item = new OrderItem();
        item.setOrderId(orderId);
        item.setTicketTypeId(ticketTypeId);
        item.setQuantity(2);
        item.setUnitPrice(new BigDecimal("100000"));
        item.setSubtotal(new BigDecimal("200000"));

        when(orderRepository.findByIdForUpdate(orderId)).thenReturn(Optional.of(order));
        when(orderItemRepository.findByOrderId(orderId)).thenReturn(List.of(item));

        assertThatThrownBy(() -> orderAdapter.getPayableOrderForUser(orderId, userId))
                .isInstanceOf(AppException.class)
                .hasMessageContaining("Thời hạn thanh toán");

        assertThat(order.getStatus()).isEqualTo(Order.Status.EXPIRED);
        verify(inventory).release(ticketTypeId, 2);
        verify(orderRepository).save(order);
    }

    private Order awaitingPaymentOrder(UUID orderId, UUID userId, OffsetDateTime expiresAt) {
        Order order = new Order();
        order.setId(orderId);
        order.setUserId(userId);
        order.setConcertId(UUID.randomUUID());
        order.setStatus(Order.Status.AWAITING_PAYMENT);
        order.setTotalAmount(new BigDecimal("200000"));
        order.setExpiresAt(expiresAt);
        return order;
    }
}
