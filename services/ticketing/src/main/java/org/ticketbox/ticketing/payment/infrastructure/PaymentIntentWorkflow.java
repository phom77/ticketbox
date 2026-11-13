package org.ticketbox.ticketing.payment.infrastructure;

import com.ticketbox.shared.event.PaymentCompletedEvent;

import lombok.RequiredArgsConstructor;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.payment.PaymentAck;
import org.ticketbox.ticketing.application.port.payment.PaymentIntent;
import org.ticketbox.ticketing.application.port.payment.PaymentResult;
import org.ticketbox.ticketing.application.port.payment.PaymentSnapshot;
import org.ticketbox.ticketing.application.port.payment.PaymentWorkflowPort;
import org.ticketbox.ticketing.order.application.port.OrderPort;
import org.ticketbox.ticketing.order.application.port.OrderView;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PaymentIntentWorkflow implements PaymentWorkflowPort {
    private final JdbcTemplate db;
    private final OrderPort orders;
    private final ApplicationEventPublisher events;

    private PaymentIntent intent(ResultSet rs) throws SQLException {
        return new PaymentIntent(
                1,
                rs.getObject("intent_id", UUID.class),
                rs.getObject("order_id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("provider"),
                rs.getBigDecimal("amount"),
                rs.getString("currency"),
                rs.getObject("expires_at", OffsetDateTime.class),
                rs.getLong("order_version"),
                rs.getString("request_id"),
                rs.getString("intent_id"));
    }

    private PaymentIntent find(UUID order) {
        var rows =
                db.query(
                        "SELECT * FROM ticketing_payment_intents WHERE order_id=?",
                        (rs, n) -> intent(rs),
                        order);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @Override
    @Transactional(noRollbackFor = AppException.class)
    public PaymentIntent prepare(UUID orderId, UUID user, String provider) {
        OrderView order = orders.getPayableOrderForUser(orderId, user);
        PaymentIntent found = find(orderId);
        if (found != null) {
            if (!found.provider().equals(provider))
                throw new AppException(
                        ErrorCode.INVALID_STATUS_TRANSITION,
                        "error.payment.provider-already-selected");
            return found;
        }
        if (order.paymentUrl() != null || order.paymentProvider() != null)
            throw new AppException(
                    ErrorCode.INVALID_STATUS_TRANSITION, "error.payment.reconciliation-required");
        boolean suspended = Boolean.TRUE.equals(db.queryForObject("""
                SELECT c.sales_suspended FROM concerts c JOIN orders o ON o.concert_id=c.id WHERE o.id=? FOR SHARE OF c
                """, Boolean.class, orderId));
        if (suspended) throw new AppException(ErrorCode.CONCERT_NOT_ON_SALE);
        UUID id = UUID.randomUUID();
        db.update(
                "INSERT INTO"
                    + " ticketing_payment_intents(order_id,intent_id,user_id,provider,amount,currency,request_id,expires_at)"
                    + " VALUES(?,?,?,?,?,'VND',?,?)",
                orderId,
                id,
                user,
                provider,
                order.totalAmount(),
                id.toString(),
                order.expiresAt());
        return find(orderId);
    }

    @Override
    @Transactional(readOnly = true)
    public Progress owned(UUID orderId, UUID user) {
        OrderView order =
                orders.findOrderById(orderId)
                        .filter(o -> o.userId().equals(user))
                        .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND));
        var rows =
                db.query(
                        "SELECT * FROM ticketing_payment_intents WHERE order_id=?",
                        (rs, n) ->
                                new Progress(
                                        order,
                                        intent(rs),
                                        new PaymentSnapshot(
                                                rs.getObject("attempt_id", UUID.class),
                                                switch (rs.getString("state")) {
                                                    case "SETTLED" -> "SUCCEEDED";
                                                    case "REJECTED" -> "RECONCILIATION_REQUIRED";
                                                    case "CREATED" -> "PROCESSING";
                                                    default -> rs.getString("state");
                                                },
                                                rs.getString("payment_url"),
                                                rs.getString("provider_ref"))),
                        orderId);
        return rows.isEmpty() ? new Progress(order, null, null) : rows.getFirst();
    }

    @Override
    @Transactional
    public List<Claim> claim(int limit) {
        UUID owner = UUID.randomUUID();
        return db.query(
                """
UPDATE ticketing_payment_intents SET lease_owner=?,lease_until=now()+interval '1 minute'
WHERE order_id IN (SELECT order_id FROM ticketing_payment_intents
 WHERE state IN ('CREATED','UNKNOWN','READY') AND next_attempt_at<=now()
  AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT ?)
RETURNING *
""",
                (rs, n) -> new Claim(intent(rs), owner),
                owner,
                limit);
    }

    @Override
    @Transactional
    public void snapshot(Claim claim, PaymentSnapshot snapshot) {
        var current = orders.lockOrder(claim.intent().orderId()).orElseThrow();
        // A result callback can settle the order before the create response arrives.
        int changed =
                db.update(
                        """
UPDATE ticketing_payment_intents SET attempt_id=?,state=?,payment_url=?,provider_ref=?,lease_owner=NULL,lease_until=NULL,
 last_error=NULL,next_attempt_at=now()+interval '5 seconds',updated_at=now()
WHERE order_id=? AND lease_owner=? AND state NOT IN ('SETTLED','REJECTED')
""",
                        snapshot.attemptId(),
                        snapshot.state(),
                        snapshot.paymentUrl(),
                        snapshot.providerRef(),
                        current.id(),
                        claim.owner());
        if (changed == 1
                && "READY".equals(snapshot.state())
                && "AWAITING_PAYMENT".equals(current.status())
                && current.expiresAt().isAfter(OffsetDateTime.now()))
            orders.markPaymentInitiated(
                    current.id(),
                    claim.intent().provider(),
                    claim.intent().requestId(),
                    snapshot.paymentUrl());
    }

    @Override
    @Transactional
    public void failed(Claim claim, String error) {
        db.update(
                "UPDATE ticketing_payment_intents SET"
                    + " attempts=attempts+1,last_error=?,lease_owner=NULL,lease_until=NULL,next_attempt_at=now()+interval"
                    + " '5 seconds' WHERE order_id=? AND lease_owner=?",
                error,
                claim.intent().orderId(),
                claim.owner());
    }

    @Override
    @Transactional
    public PaymentAck receive(PaymentResult result) {
        if (result.schemaVersion() != 1
                || result.eventId() == null
                || result.occurredAt() == null
                || result.transactionId() == null
                || result.transactionId().isBlank())
            throw new AppException(ErrorCode.INVALID_REQUEST, "Invalid payment result");
        OrderView order =
                orders.lockOrder(result.orderId())
                        .orElseThrow(() -> new AppException(ErrorCode.ORDER_NOT_FOUND));
        PaymentIntent intent = find(order.id());
        if (intent == null
                || !intent.intentId().equals(result.intentId())
                || !intent.userId().equals(result.userId())
                || !intent.provider().equals(result.provider())
                || !intent.requestId().equals(result.requestId())
                || result.amount() == null
                || intent.amount().compareTo(result.amount()) != 0
                || !intent.currency().equals(result.currency())
                || intent.orderVersion() != result.orderVersion())
            throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "The result does not match the committed payment intent");
        var collision =
                db.queryForList(
                        "SELECT intent_id FROM ticketing_payment_inbox WHERE event_id=?",
                        result.eventId());
        if (!collision.isEmpty()
                && !intent.intentId().equals(collision.getFirst().get("intent_id")))
            throw new AppException(
                    ErrorCode.INVALID_REQUEST, "Event identity belongs to another intent");
        var previous =
                db.query(
                        "SELECT * FROM ticketing_payment_inbox WHERE event_id=?",
                        (rs, n) ->
                                new PaymentAck(
                                        result.eventId(),
                                        rs.getString("decision"),
                                        rs.getString("reason")),
                        result.eventId());
        if (!previous.isEmpty()) return previous.getFirst();
        var row =
                db.queryForMap(
                        "SELECT state,transaction_id FROM ticketing_payment_intents WHERE"
                                + " order_id=?",
                        order.id());
        boolean already = List.of("SETTLED", "REJECTED").contains(row.get("state"));
        if (already && !Objects.equals(row.get("transaction_id"), result.transactionId()))
            throw new AppException(
                    ErrorCode.INVALID_REQUEST,
                    "Another transaction already processed this payment intent");
        boolean accepted;
        if (already) accepted = "SETTLED".equals(row.get("state"));
        else {
            if ("PAID".equals(order.status())
                    && (!Objects.equals(order.paymentRef(), result.transactionId())
                            || !Objects.equals(order.paymentProvider(), result.provider())))
                throw new AppException(
                        ErrorCode.INVALID_REQUEST, "The order was paid by another transaction");
            accepted = orders.settlePayment(order.id(), result.provider(), result.transactionId());
            db.update(
                    "UPDATE ticketing_payment_intents SET"
                        + " state=?,transaction_id=?,lease_owner=NULL,lease_until=NULL,updated_at=now()"
                        + " WHERE order_id=?",
                    accepted ? "SETTLED" : "REJECTED",
                    result.transactionId(),
                    order.id());
            if (accepted)
                events.publishEvent(
                        new PaymentCompletedEvent(
                                result.eventId(),
                                order.id(),
                                order.userId(),
                                result.provider(),
                                result.transactionId(),
                                intent.amount(),
                                OffsetDateTime.now()));
        }
        String reason =
                accepted
                        ? "Tickets confirmed"
                        : "Order expired or cancelled; money requires compensation review";
        db.update(
                "INSERT INTO ticketing_payment_inbox(event_id,intent_id,decision,reason)"
                        + " VALUES(?,?,?,?)",
                result.eventId(),
                intent.intentId(),
                accepted ? "ACCEPTED" : "REJECTED",
                reason);
        return new PaymentAck(result.eventId(), accepted ? "ACCEPTED" : "REJECTED", reason);
    }
}
