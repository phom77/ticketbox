package org.ticketbox.ticketing.order.application;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.identity.UserContactPort;
import org.ticketbox.ticketing.order.application.dto.OrderResponse;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.application.port.OrderDeliveryStatus;
import org.ticketbox.ticketing.order.application.port.OrderSupportQueue;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class OrderSupportService {
    public record SearchPage(List<OrderResponse> content, int page, int size, long totalElements, int totalPages) {}
    public record TicketStatus(UUID id, String status, java.time.OffsetDateTime issuedAt) {}

    private final OrderRepository orders;
    private final OrderService orderService;
    private final UserContactPort identity;
    private final TicketRepository tickets;
    private final OrderDeliveryStatus delivery;
    private final Optional<PaymentGatewayClient> payment;
    private final OrderSupportQueue queue;

    public OrderSupportService(OrderRepository orders, OrderService orderService, UserContactPort identity,
            TicketRepository tickets, OrderDeliveryStatus delivery, Optional<PaymentGatewayClient> payment,
            OrderSupportQueue queue) {
        this.orders = orders;
        this.orderService = orderService;
        this.identity = identity;
        this.tickets = tickets;
        this.delivery = delivery;
        this.payment = payment;
        this.queue = queue;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SearchPage search(UUID organization, UUID concert, UUID order, String email, String transaction, int page, int size) {
        boolean byEmail = email != null && !email.isBlank();
        boolean byTransaction = transaction != null && !transaction.isBlank();
        int methods = (order == null ? 0 : 1) + (byEmail ? 1 : 0) + (byTransaction ? 1 : 0);
        if (methods != 1 || page < 0 || size < 1 || size > 100
                || (byEmail && email.length() > 254) || (byTransaction && transaction.length() > 255)) {
            throw new AppException(ErrorCode.INVALID_REQUEST, "error.invalid-request");
        }
        UUID buyer = null;
        if (byEmail) {
            buyer = identity.findAccountIdByEmail(email).orElse(null);
            if (buyer == null) return new SearchPage(List.of(), page, size, 0, 0);
        }
        var found = orders.searchSupport(organization, concert, order, buyer,
                byTransaction ? transaction.strip() : null, PageRequest.of(page, size));
        return new SearchPage(orderService.toOrderResponses(found.getContent()), page, size,
                found.getTotalElements(), found.getTotalPages());
    }

    public Object detail(UUID organization, UUID order, String section) {
        if (orders.searchSupport(organization, null, order, null, null, PageRequest.of(0, 1)).isEmpty()) {
            throw new AppException(ErrorCode.ORDER_NOT_FOUND);
        }
        return switch (section) {
            case "tickets" -> tickets.findByOrderId(order).stream()
                    .map(ticket -> new TicketStatus(ticket.getId(), ticket.getStatus().name(), ticket.getIssuedAt()))
                    .toList();
            case "delivery" -> delivery.emails(order);
            case "payment" -> paymentDetail(organization, order);
            default -> throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
        };
    }

    private PaymentGatewayClient.PaymentSupport paymentDetail(UUID organization, UUID order) {
        var details = payment.map(provider -> provider.support(order))
                .orElseThrow(() -> new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE));
        if (organization == null) return details;
        return new PaymentGatewayClient.PaymentSupport(details.attempt(), details.cases().stream()
                .map(review -> new PaymentGatewayClient.Review(review.id(), review.state(), review.amount(),
                        review.externalReference(), review.recordedAt(), null, null, review.occurredAt())).toList());
    }

    public OrderSupportQueue.Page queue(OrderSupportQueue.Kind kind, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new AppException(ErrorCode.INVALID_REQUEST);
        return switch (kind) {
            case FAILED_EMAIL -> delivery.failedEmails(page, size);
            case PENDING_REFUND -> payment.map(provider -> provider.pendingRefunds(page, size))
                    .orElseThrow(() -> new AppException(ErrorCode.SUPPORT_SOURCE_UNAVAILABLE));
            case UNKNOWN_PAYMENT, MISSING_TICKETS -> queue.list(kind, page, size);
        };
    }
}
