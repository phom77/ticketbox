package com.ticketbox.payments.infrastructure.persistence;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.payments.application.error.PaymentRejection;
import com.ticketbox.payments.application.port.RefundCases;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
class JdbcRefundCases implements RefundCases {
    private final JdbcTemplate db;
    private final ObjectMapper json;

    JdbcRefundCases(JdbcTemplate db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    @Transactional
    public Case apply(UUID order, Command command) {
        if (command.actionId() == null || command.actorId() == null || command.action() == null
                || command.detail() == null || command.detail().isBlank() || command.detail().length() > 1000) {
            throw invalid("Refund action, actor and reason are required");
        }
        Receipt receipt = lockReceipt(order);
        Case existing = current(receipt);
        String fingerprint = fingerprint(command);
        var audit = db.queryForList("SELECT order_id,actor_id,action,detail FROM payment_audit WHERE id=?", command.actionId());
        if (!audit.isEmpty()) {
            var entry = audit.getFirst();
            if (order.equals(entry.get("order_id")) && command.actorId().equals(entry.get("actor_id"))
                    && ("REFUND_" + command.action()).equals(entry.get("action"))
                    && fingerprint.equals(entry.get("detail")) && existing != null) return existing;
            throw conflict("Refund action identity was already used");
        }
        if (command.action() == Action.REQUEST) {
            request(receipt, existing, command);
        } else {
            if (existing == null || !existing.id().equals(command.caseId())) throw conflict("Refund case does not match the order");
            transition(receipt, existing, command);
        }
        int inserted = db.update("""
                INSERT INTO payment_audit(id,order_id,actor_id,action,detail) VALUES (?,?,?,?,?)
                ON CONFLICT (id) DO NOTHING
                """, command.actionId(), order, command.actorId(), "REFUND_" + command.action(), fingerprint);
        if (inserted != 1) throw conflict("Refund action identity was already used");
        return current(receipt);
    }

    private Receipt lockReceipt(UUID order) {
        var receipts = db.query("""
                SELECT intent_id,provider,provider_transaction_id,state,amount,verified_at
                FROM payment_attempts WHERE order_id=? FOR UPDATE
                """, (row, n) -> new Receipt(order, row.getObject("intent_id", UUID.class), row.getString("provider"),
                row.getString("provider_transaction_id"), row.getString("state"), row.getLong("amount"),
                row.getObject("verified_at", OffsetDateTime.class)), order);
        if (receipts.isEmpty()) throw new PaymentRejection(PaymentRejection.Kind.MISSING_ATTEMPT, "Payment attempt not found");
        Receipt receipt = receipts.getFirst();
        if (receipt.verifiedAt() == null || receipt.transaction() == null
                || !List.of("SUCCEEDED", "RECONCILIATION_REQUIRED").contains(receipt.state())) {
            throw conflict("Only settled collections or confirmed compensation are refundable");
        }
        return receipt;
    }

    private Case current(Receipt receipt) {
        return db.query("""
                SELECT request_id,state,amount,requested_by,approved_by,external_reference,provider_refunded_at
                FROM refund_reviews WHERE provider=? AND transaction_id=?
                """, (row, n) -> new Case(row.getObject("request_id", UUID.class), receipt.order(), row.getString("state"),
                row.getLong("amount"), row.getObject("requested_by", UUID.class), row.getObject("approved_by", UUID.class),
                receipt.provider(), receipt.transaction(), row.getString("external_reference"),
                row.getObject("provider_refunded_at", OffsetDateTime.class), receipt.compensation()),
                receipt.provider(), receipt.transaction()).stream().findFirst().orElse(null);
    }

    private void request(Receipt receipt, Case existing, Command command) {
        if (existing != null) {
            if (!"REVIEW_REQUIRED".equals(existing.state()) || existing.requestedBy() != null) {
                throw conflict("A refund case already exists for this collection");
            }
            db.update("UPDATE refund_reviews SET requested_by=?, state='REQUESTED' WHERE request_id=?",
                    command.actorId(), existing.id());
        } else {
            db.update("""
                    INSERT INTO refund_reviews(request_id,intent_id,order_id,provider,transaction_id,amount,state,reason,requested_by)
                    VALUES (?,?,?,?,?,?,'REQUESTED',?,?)
                    """, UUID.randomUUID(), receipt.intent(), receipt.order(), receipt.provider(), receipt.transaction(),
                    receipt.amount(), command.detail(), command.actorId());
        }
    }

    private void transition(Receipt receipt, Case existing, Command command) {
        switch (command.action()) {
            case BEGIN_APPROVAL -> {
                if (List.of("HOLD_PENDING", "APPROVED").contains(existing.state())
                        && command.actorId().equals(existing.approvedBy())) return;
                if (!"REQUESTED".equals(existing.state()) || command.actorId().equals(existing.requestedBy())) {
                    throw conflict("A different admin must approve the requested refund");
                }
                db.update("UPDATE refund_reviews SET state='HOLD_PENDING',approved_by=? WHERE request_id=?",
                        command.actorId(), existing.id());
            }
            case APPROVE -> {
                if (!"HOLD_PENDING".equals(existing.state()) || !command.actorId().equals(existing.approvedBy())) {
                    throw conflict("Refund approval was not started by this admin");
                }
                db.update("UPDATE refund_reviews SET state='APPROVED' WHERE request_id=?", existing.id());
            }
            case CONFIRM -> confirm(receipt, existing, command);
            case ABORT -> {
                if (!List.of("REQUESTED", "HOLD_PENDING", "APPROVED").contains(existing.state())) {
                    throw conflict("Refund case cannot be closed without a refund");
                }
                db.update("UPDATE refund_reviews SET state='ABORTED',resolved_by=?,resolved_at=clock_timestamp() WHERE request_id=?",
                        command.actorId(), existing.id());
                enqueue(existing.id());
            }
            case REQUEST -> throw new IllegalArgumentException("Refund request is handled separately");
        }
    }

    private void confirm(Receipt receipt, Case existing, Command command) {
        if (!"APPROVED".equals(existing.state())) throw conflict("Refund needs approval before confirmation");
        if (command.amount() == null || command.amount() != receipt.amount() || command.externalReference() == null
                || command.externalReference().isBlank() || command.externalReference().length() > 255
                || command.occurredAt() == null || command.occurredAt().isBefore(receipt.verifiedAt())
                || command.occurredAt().isAfter(OffsetDateTime.now())) {
            throw invalid("Confirmed refund requires the full collected amount, provider reference and actual time");
        }
        try {
            db.update("""
                    UPDATE refund_reviews SET state='RESOLVED_MANUALLY',external_reference=?,provider_refunded_at=?,
                        resolved_by=?,resolved_at=clock_timestamp() WHERE request_id=?
                    """, command.externalReference().strip(), command.occurredAt(), command.actorId(), existing.id());
        } catch (DuplicateKeyException duplicate) {
            throw conflict("Provider refund reference is already recorded");
        }
        enqueue(existing.id());
    }

    private void enqueue(UUID id) {
        db.update("INSERT INTO refund_result_outbox(case_id) VALUES (?) ON CONFLICT DO NOTHING", id);
    }

    private String fingerprint(Command command) {
        try {
            return json.writeValueAsString(command);
        } catch (JsonProcessingException failure) {
            throw new IllegalStateException("Refund action cannot be encoded", failure);
        }
    }

    private record Receipt(UUID order, UUID intent, String provider, String transaction, String state,
                           long amount, OffsetDateTime verifiedAt) {
        boolean compensation() { return "RECONCILIATION_REQUIRED".equals(state); }
    }

    private static PaymentRejection conflict(String message) {
        return new PaymentRejection(PaymentRejection.Kind.IDENTITY_CONFLICT, message);
    }

    private static PaymentRejection invalid(String message) {
        return new PaymentRejection(PaymentRejection.Kind.INVALID_REQUEST, message);
    }
}
