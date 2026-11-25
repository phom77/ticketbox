package org.ticketbox.ticketing.order.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.order.application.dto.DisruptionNotice;
import org.ticketbox.ticketing.order.application.dto.EventOptions;
import org.ticketbox.ticketing.order.application.port.DisruptionOptionsStore;
import org.ticketbox.ticketing.order.application.port.DisruptionOptionsStore.Disruption;

import java.util.List;
import java.util.UUID;

/** Tells a buyer what changed for a postponed or cancelled event and what they can do about each order. */
@Service
public class DisruptionOptionsService {
    private final DisruptionOptionsStore store;
    private final RefundRequestService refundRequests;

    public DisruptionOptionsService(DisruptionOptionsStore store, RefundRequestService refundRequests) {
        this.store = store;
        this.refundRequests = refundRequests;
    }

    @Transactional(readOnly = true)
    public List<DisruptionNotice> notices(UUID buyerId) {
        return store.forBuyer(buyerId).stream().map(DisruptionOptionsService::notice).toList();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public EventOptions options(UUID buyerId, UUID concertId) {
        Disruption disruption = store.find(buyerId, concertId)
                .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND, "error.disruption.not-found"));
        boolean cancelled = "CANCEL".equals(disruption.kind());
        var orders = store.orders(buyerId, concertId).stream().map(order -> {
            String stage = "REFUNDED".equals(order.status()) ? "REFUNDED"
                    : "PREPARED".equals(order.refundState()) ? "APPROVED" : "PENDING";
            if (cancelled) {
                return new EventOptions.OptionsOrder(order.orderId(), order.referenceCode(), order.amount(), order.status(),
                        stage, false, null, null);
            }
            var state = refundRequests.state(buyerId, order.orderId());
            return new EventOptions.OptionsOrder(order.orderId(), order.referenceCode(), order.amount(), order.status(),
                    stage, state.canRequest(), state.blockedReason(), state.request());
        }).toList();
        return new EventOptions(notice(disruption), orders);
    }

    private static DisruptionNotice notice(Disruption d) {
        return new DisruptionNotice(d.concertId(), d.concertTitle(), d.kind(), d.newEventDate());
    }
}
