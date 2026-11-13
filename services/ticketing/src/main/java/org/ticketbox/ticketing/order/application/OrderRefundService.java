package org.ticketbox.ticketing.order.application;

import org.springframework.stereotype.Service;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.order.application.port.RefundProviders;
import org.ticketbox.ticketing.order.application.port.RefundProviders.Action;
import org.ticketbox.ticketing.order.application.port.RefundProviders.Case;
import org.ticketbox.ticketing.order.application.port.RefundProviders.Command;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class OrderRefundService {
    public enum Decision { REQUEST, APPROVE, CONFIRM, ABORT }
    public record Request(UUID actionId, UUID caseId, Decision action, String detail, Long amount,
                          String externalReference, OffsetDateTime occurredAt) {}

    private final RefundProviders providers;
    private final RefundOrderEffects effects;

    public OrderRefundService(RefundProviders providers, RefundOrderEffects effects) {
        this.providers = providers;
        this.effects = effects;
    }

    public Case decide(UUID order, UUID actor, Request request) {
        if (request.actionId() == null || request.action() == null) throw new AppException(ErrorCode.INVALID_REQUEST);
        if (request.action() == Decision.APPROVE) {
            var pending = providers.apply(order, command(actor, request, Action.BEGIN_APPROVAL));
            if (!"HOLD_PENDING".equals(pending.state())) return pending;
            var ids = effects.prepare(order, pending.id(), pending.compensation());
            if (!ids.isEmpty()) {
                var admission = providers.hold(pending.id(), ids);
                if (admission == RefundProviders.Admission.NOT_SYNCED) return pending;
                if (admission != RefundProviders.Admission.HELD) throw new AppException(ErrorCode.REFUND_CONFLICT);
            }
            UUID approvalId = UUID.nameUUIDFromBytes(("refund-approved:" + request.actionId()).getBytes(StandardCharsets.UTF_8));
            return providers.apply(order, new Command(approvalId, actor, pending.id(), Action.APPROVE,
                    request.detail(), null, null, null));
        }
        return providers.apply(order, command(actor, request, Action.valueOf(request.action().name())));
    }

    private static Command command(UUID actor, Request request, Action action) {
        return new Command(request.actionId(), actor, request.caseId(), action, request.detail(),
                request.amount(), request.externalReference(), request.occurredAt());
    }

    public void receive(RefundOrderEffects.Result result) {
        effects.apply(result);
        if ("ABORTED".equals(result.outcome())) providers.release(result.caseId());
    }
}
