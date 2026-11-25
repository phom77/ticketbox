package org.ticketbox.ticketing.order.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.order.application.dto.ManagedRefundRequest;
import org.ticketbox.ticketing.order.application.dto.ManagedRefundRequestPage;
import org.ticketbox.ticketing.order.application.dto.RefundRequestState;
import org.ticketbox.ticketing.order.application.dto.RefundRequestView;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.order.application.port.RefundRequestNotifier;
import org.ticketbox.ticketing.order.application.port.RefundRequestNotifier.Kind;
import org.ticketbox.ticketing.order.application.port.RefundRequestStore;
import org.ticketbox.ticketing.order.application.port.RefundRequestStore.OrderRef;
import org.ticketbox.ticketing.order.domain.RefundEligibility;
import org.ticketbox.ticketing.order.domain.RefundRequest;
import org.ticketbox.ticketing.payment.application.port.PaymentGatewayClient;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Buyer refund requests: the buyer asks, the organizer (or, after a postponement, the event change itself)
 * decides, and the existing Payment refund case does the rest. Every change takes the order row lock first,
 * the lock that payment, refund, transfer and expiry already use.
 */
@Service
public class RefundRequestService {
    private static final Logger log = LoggerFactory.getLogger(RefundRequestService.class);
    /** Payment refund-case states that still decide the order. */
    static final Set<String> OPEN_CASE_STATES = Set.of("REVIEW_REQUIRED", "REQUESTED", "HOLD_PENDING", "APPROVED");
    static final int MAX_PAGE_SIZE = 100;

    private final RefundRequestStore store;
    private final RefundProviders providers;
    private final RefundRequestNotifier notifier;
    private final TransactionTemplate transaction;
    private final Optional<PaymentGatewayClient> payment;

    public RefundRequestService(RefundRequestStore store, RefundProviders providers, RefundRequestNotifier notifier,
            TransactionTemplate transaction, Optional<PaymentGatewayClient> payment) {
        this.store = store;
        this.providers = providers;
        this.notifier = notifier;
        this.transaction = transaction;
        this.payment = payment;
    }

    @Transactional(readOnly = true)
    public RefundRequestState state(UUID buyerId, UUID orderId) {
        OrderRef order = store.order(orderId).filter(o -> o.buyerId().equals(buyerId))
                .orElseThrow(RefundRequestService::orderNotFound);
        var latest = store.findLatestByOrder(order.orderId());
        var outcome = RefundEligibility.evaluate(store.facts(orderId), OffsetDateTime.now());
        return new RefundRequestState(outcome.allowed(), outcome.blocker() == null ? null : outcome.blocker().name(),
                outcome.origin() == null ? null : outcome.origin().name(), outcome.deadline(),
                latest.map(RefundRequestService::view).orElse(null));
    }

    public RefundRequestView request(UUID buyerId, UUID orderId, String reason) {
        UUID id = transaction.execute(status -> create(buyerId, orderId, reason));
        handoffQuietly(id);
        return view(store.find(id).orElseThrow());
    }

    public RefundRequestView withdraw(UUID buyerId, UUID orderId, UUID requestId) {
        return transaction.execute(status -> {
            RefundRequest request = lockedRequest(requestId);
            if (!request.orderId().equals(orderId)) throw requestNotFound();
            request.withdraw(buyerId, OffsetDateTime.now());
            store.update(request);
            return view(request);
        });
    }

    @Transactional(readOnly = true)
    public ManagedRefundRequestPage list(UUID organizationId, List<RefundRequest.Status> statuses, Integer olderThanDays,
            int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE || (olderThanDays != null && olderThanDays < 0)) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        OffsetDateTime before = olderThanDays == null ? null : OffsetDateTime.now().minusDays(olderThanDays);
        var found = store.list(organizationId, statuses == null ? List.of() : statuses, before, page, size);
        return new ManagedRefundRequestPage(found.content().stream().map(RefundRequestService::managed).toList(),
                found.page(), found.size(), found.totalElements(), found.totalPages());
    }

    /** Approves a request and opens the platform case; calling it again retries a hand-off that failed. */
    public ManagedRefundRequest approve(UUID organizationId, UUID actor, UUID requestId) {
        transaction.executeWithoutResult(status -> {
            RefundRequest request = scopedLockedRequest(organizationId, requestId);
            if (request.status() == RefundRequest.Status.APPROVED && request.paymentCaseId() == null) return;
            var notRefundable = RefundEligibility.stillRefundable(store.facts(request.orderId()));
            if (notRefundable.isPresent()) throw notAllowed(notRefundable.get());
            request.approve(actor, OffsetDateTime.now());
            store.update(request);
            notifier.notifyBuyer(Kind.APPROVED, store.row(requestId).orElseThrow());
        });
        handoff(requestId);
        return managed(store.row(requestId).orElseThrow());
    }

    public ManagedRefundRequest reject(UUID organizationId, UUID actor, UUID requestId, String note) {
        return transaction.execute(status -> {
            RefundRequest request = scopedLockedRequest(organizationId, requestId);
            request.reject(actor, note, OffsetDateTime.now());
            store.update(request);
            var row = store.row(requestId).orElseThrow();
            notifier.notifyBuyer(Kind.REJECTED, row);
            return managed(row);
        });
    }

    /** Opens the Payment case for approved requests whose first hand-off failed. */
    public int retryHandoffs() {
        int opened = 0;
        for (UUID id : store.approvedWithoutCase(OffsetDateTime.now().minusMinutes(1), 50)) {
            try {
                handoff(id);
                opened++;
            } catch (RuntimeException failure) {
                log.warn("Refund request hand-off will retry: {}", failure.getMessage());
            }
        }
        return opened;
    }

    private UUID create(UUID buyerId, UUID orderId, String reason) {
        OrderRef order = store.lockOrder(orderId).filter(o -> o.buyerId().equals(buyerId))
                .orElseThrow(RefundRequestService::orderNotFound);
        OffsetDateTime now = OffsetDateTime.now();
        var outcome = RefundEligibility.evaluate(store.facts(orderId), now);
        if (!outcome.allowed()) throw notAllowed(outcome.blocker());
        requireNoOpenPaymentCase(orderId);
        RefundRequest request = RefundRequest.open(orderId, buyerId, reason, outcome.origin(), now);
        store.insert(request);
        var row = store.row(request.id()).orElseThrow();
        notifier.notifyBuyer(Kind.RECEIVED, row);
        if (order.organizationId() == null && request.origin() == RefundRequest.Origin.BUYER) {
            log.warn("Refund request {} belongs to an order without an organization; only platform admins can decide it",
                    request.id());
        }
        return request.id();
    }

    private void handoffQuietly(UUID id) {
        try {
            handoff(id);
        } catch (RuntimeException failure) {
            log.warn("Refund request {} hand-off will retry: {}", id, failure.getMessage());
        }
    }

    /** Sends the existing Payment case command with the request's origin; Payment replays it by action id. */
    private void handoff(UUID id) {
        RefundRequest request = store.find(id).orElseThrow();
        if (request.status() != RefundRequest.Status.APPROVED || request.paymentCaseId() != null) return;
        UUID actor = request.decidedBy() != null ? request.decidedBy() : request.buyerId();
        UUID actionId = UUID.nameUUIDFromBytes(("refund-request:" + id).getBytes(StandardCharsets.UTF_8));
        var opened = providers.apply(request.orderId(), new RefundProviders.Command(actionId, actor, null,
                RefundProviders.Action.REQUEST, request.reason(), null, null, null, request.origin().name(), id));
        transaction.executeWithoutResult(status -> {
            RefundRequest locked = lockedRequest(id);
            if (locked.status() == RefundRequest.Status.APPROVED && locked.paymentCaseId() == null) {
                locked.attachCase(opened.id());
                store.update(locked);
            }
        });
    }

    private RefundRequest scopedLockedRequest(UUID organizationId, UUID requestId) {
        RefundRequest request = lockedRequest(requestId);
        if (organizationId != null && !store.row(requestId).map(RefundRequestStore.Row::organizationId)
                .filter(organizationId::equals).isPresent()) throw requestNotFound();
        return request;
    }

    /** Takes the order lock before reading the request, so concurrent decisions are applied one at a time. */
    private RefundRequest lockedRequest(UUID requestId) {
        UUID orderId = store.orderIdOf(requestId).orElseThrow(RefundRequestService::requestNotFound);
        store.lockOrder(orderId);
        return store.find(requestId).orElseThrow(RefundRequestService::requestNotFound);
    }

    /** An operator-opened case in Payment blocks the request too; when Payment cannot answer, the request fails closed. */
    private void requireNoOpenPaymentCase(UUID orderId) {
        payment.ifPresent(client -> {
            var support = client.support(orderId);
            boolean open = support != null && support.cases() != null && support.cases().stream()
                    .anyMatch(c -> c != null && OPEN_CASE_STATES.contains(c.state()));
            if (open) throw notAllowed(RefundEligibility.Reason.REFUND_IN_PROGRESS);
        });
    }

    private static RefundRequestView view(RefundRequest r) {
        return new RefundRequestView(r.id(), r.orderId(), r.status().name(), r.origin().name(), r.reason(),
                r.decisionNote(), r.createdAt(), r.decidedAt(), r.status() == RefundRequest.Status.REQUESTED);
    }

    private static ManagedRefundRequest managed(RefundRequestStore.Row row) {
        RefundRequest r = row.request();
        return new ManagedRefundRequest(r.id(), r.orderId(), row.orderReference(), row.concertId(), row.concertTitle(),
                row.amount(), r.status().name(), r.origin().name(), r.reason(), r.decisionNote(), r.createdAt(),
                r.decidedAt(), r.status() == RefundRequest.Status.APPROVED && r.paymentCaseId() == null);
    }

    private static AppException notAllowed(RefundEligibility.Reason reason) {
        return new AppException(ErrorCode.REFUND_REQUEST_NOT_ALLOWED, reason.messageKey());
    }

    private static AppException orderNotFound() {
        return new AppException(ErrorCode.ORDER_NOT_FOUND, "error.order-not-found");
    }

    private static AppException requestNotFound() {
        return new AppException(ErrorCode.REFUND_REQUEST_NOT_FOUND, "error.refund-request.not-found");
    }
}
