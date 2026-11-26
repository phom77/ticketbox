package org.ticketbox.ticketing.order.application;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.issuance.application.port.TicketRepository;
import org.ticketbox.ticketing.issuance.domain.Ticket;
import org.ticketbox.ticketing.order.application.port.OrderEventRepository;
import org.ticketbox.ticketing.order.application.port.OrderItemRepository;
import org.ticketbox.ticketing.order.application.port.OrderRepository;
import org.ticketbox.ticketing.order.application.port.RefundPreparationStore;
import org.ticketbox.ticketing.order.application.port.RefundPreparationStore.Preparation;
import org.ticketbox.ticketing.order.application.port.RefundPreparationStore.State;
import org.ticketbox.ticketing.order.application.port.EventDisruptionStore;
import org.ticketbox.ticketing.order.application.port.RefundRequestStore;
import org.ticketbox.ticketing.application.port.catalog.ConcertOrderPort;
import org.ticketbox.ticketing.inventory.hold.application.port.PurchaseLock;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock;
import org.ticketbox.ticketing.order.domain.RefundRequest;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.reporting.application.port.SalesLedger;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class RefundOrderEffects {
    public record Result(int schemaVersion, UUID caseId, UUID orderId, String outcome, long amount,
                         String provider, String transactionId, String reference, OffsetDateTime occurredAt,
                         boolean compensation) {}

    private final OrderRepository orders;
    private final OrderEventRepository events;
    private final OrderItemRepository lines;
    private final TicketRepository tickets;
    private final RefundPreparationStore refunds;
    private final RefundRequestStore requests;
    private final OrderService orderService;
    private final PerformanceStock performanceStock;
    private final ConcertOrderPort concerts;
    private final EventDisruptionStore disruptions;
    private final PurchaseLock purchaseGuard;
    private final ApplicationEventPublisher publications;
    private final SalesLedger salesLedger;

    public RefundOrderEffects(OrderRepository orders, OrderEventRepository events, OrderItemRepository lines,
            TicketRepository tickets, RefundPreparationStore refunds, RefundRequestStore requests,
            OrderService orderService, PerformanceStock performanceStock, ConcertOrderPort concerts,
            EventDisruptionStore disruptions, PurchaseLock purchaseGuard, ApplicationEventPublisher publications,
            SalesLedger salesLedger) {
        this.salesLedger = salesLedger;
        this.orders = orders;
        this.events = events;
        this.lines = lines;
        this.tickets = tickets;
        this.refunds = refunds;
        this.requests = requests;
        this.orderService = orderService;
        this.performanceStock = performanceStock;
        this.concerts = concerts;
        this.disruptions = disruptions;
        this.purchaseGuard = purchaseGuard;
        this.publications = publications;
    }

    @Transactional
    public List<UUID> prepare(UUID orderId, UUID caseId, boolean compensation) {
        Order order = locked(orderId);
        events.restore(order);
        var existing = refunds.find(orderId);
        if (existing.isPresent()) {
            Preparation value = existing.orElseThrow();
            if (!value.caseId().equals(caseId) || value.state() != State.PREPARED || value.compensation() != compensation) {
                throw conflict();
            }
            return value.ticketIds();
        }
        var issued = tickets.findByOrderIdForUpdate(orderId);
        if (compensation) {
            if (!issued.isEmpty() || !Set.of(Order.Status.CANCELLED, Order.Status.EXPIRED, Order.Status.PAYMENT_FAILED)
                    .contains(order.getStatus())) throw conflict();
        } else {
            int quantity = lines.findByOrderId(orderId).stream().mapToInt(line -> line.getQuantity()).sum();
            if (order.getStatus() != Order.Status.PAID || quantity < 1 || issued.size() != quantity
                    || issued.stream().anyMatch(ticket -> ticket.getStatus() != Ticket.Status.VALID)) throw conflict();
        }
        List<UUID> ids = issued.stream().map(Ticket::getId).sorted().toList();
        refunds.insert(new Preparation(caseId, orderId, ids, State.PREPARED, compensation, null));
        return ids;
    }

    @Transactional
    public void apply(Result result) {
        if (result.schemaVersion() != 1 || result.caseId() == null || result.orderId() == null
                || !("CONFIRMED".equals(result.outcome()) || "ABORTED".equals(result.outcome()))) throw conflict();
        Order order = locked(result.orderId());
        var preparation = refunds.find(order.getId()).orElse(null);
        if (preparation != null && !preparation.caseId().equals(result.caseId())) throw conflict();
        if ("ABORTED".equals(result.outcome())) {
            if (preparation == null) refunds.insert(new Preparation(result.caseId(), order.getId(), List.of(),
                    State.ABORTED, result.compensation(), null));
            else if (preparation.state() == State.CONFIRMED) throw conflict();
            else refunds.finish(result.caseId(), State.ABORTED, null, null);
            requests.findByCase(result.caseId()).filter(r -> r.status() == RefundRequest.Status.APPROVED).ifPresent(r -> {
                r.failed();
                requests.update(r);
            });
            return;
        }
        if (preparation == null || preparation.compensation() != result.compensation()
                || result.reference() == null || result.reference().isBlank() || result.occurredAt() == null
                || result.amount() != order.getTotalAmount().longValueExact()) throw conflict();
        if (preparation.state() == State.CONFIRMED && result.reference().equals(preparation.reference())) return;
        if (preparation.state() != State.PREPARED) throw conflict();
        long version = events.restore(order);
        if (!result.compensation()) {
            if (order.getPaymentProvider() == null || !order.getPaymentProvider().name().equals(result.provider())
                    || !java.util.Objects.equals(order.getPaymentRef(), result.transactionId())) throw conflict();
            var issued = tickets.findByOrderIdForUpdate(order.getId());
            if (!issued.stream().map(Ticket::getId).sorted().toList().equals(preparation.ticketIds())
                    || issued.stream().anyMatch(ticket -> ticket.getStatus() != Ticket.Status.VALID)) throw conflict();
            refunds.finish(result.caseId(), State.CONFIRMED, result.reference(), result.occurredAt());
            order.refund();
            events.record(order, version, OrderEventRepository.Transition.OrderRefunded);
            salesLedger.recordRefund(order.getId(), result.provider(), result.occurredAt());
            issued.forEach(ticket -> ticket.setStatus(Ticket.Status.CANCELLED));
            closeRequest(order.getId(), result);
            restock(order, result.caseId());
        } else {
            refunds.finish(result.caseId(), State.CONFIRMED, result.reference(), result.occurredAt());
        }
        var payload = new HashMap<String, Object>(Map.of("orderId", order.getId(), "amount", result.amount()));
        if (order.getReferenceCode() != null) payload.put("orderReference", order.getReferenceCode());
        publications.publishEvent(new com.ticketbox.shared.event.RemoteNotificationRequested(1, "ticketing.order-refunded",
                result.caseId(), order.getId(), order.getUserId(), result.occurredAt(), result.caseId().toString(), payload));
    }

    /**
     * ADR 0004: a confirmed refund returns the order's seats or quantity to sale while the performance is on sale, not
     * disrupted and before its sale end. The per-account quota needs no change: it counts only awaiting-payment and paid
     * orders, so the refunded order stops counting when it becomes REFUNDED. The caller applies this once, in the
     * transaction that cancels the tickets; a replayed result returns before reaching it.
     */
    private void restock(Order order, UUID caseId) {
        if (!saleOpen(order)) return;
        purchaseGuard.lock(order.getUserId(), order.getConcertId());
        orderService.releasePendingAllocations(order, lines.findByOrderId(order.getId()));
        refunds.markStockReleased(caseId);
    }

    private boolean saleOpen(Order order) {
        OffsetDateTime now = OffsetDateTime.now();
        if (disruptions.disrupted(order.getConcertId())) return false;
        if (order.getPerformanceId() != null) {
            return performanceStock.sale(order.getPerformanceId(), false).filter(sale -> sale.onSale() && !sale.suspended()
                    && sale.saleEndAt() != null && now.isBefore(sale.saleEndAt())).isPresent();
        }
        return concerts.findConcertById(order.getConcertId()).filter(concert -> "ON_SALE".equals(concert.status())
                && concert.saleEndAt() != null && now.isBefore(concert.saleEndAt())).isPresent();
    }

    /** The request that led to this case, or any open request when an operator refunded the order directly. */
    private void closeRequest(UUID orderId, Result result) {
        requests.findByCase(result.caseId()).or(() -> requests.findOpenByOrder(orderId)).filter(RefundRequest::isOpen)
                .ifPresent(request -> {
                    request.refunded(result.occurredAt());
                    requests.update(request);
                });
    }

    private Order locked(UUID id) {
        return orders.findByIdForUpdate(id).orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND));
    }

    private static AppException conflict() { return new AppException(ErrorCode.REFUND_CONFLICT); }
}
