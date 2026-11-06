package org.ticketbox.ticketing.order.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.ticketbox.ticketing.order.domain.Order;
import org.ticketbox.ticketing.order.domain.OrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY)
public class OrderEventStore {
    public enum Transition {
        OrderPaymentInitiated, OrderPaid, OrderExpired, OrderCancelled
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final OrderRepository orders;

    public void created(UUID orderId) {
        orders.flush();
        append(orderId, 0, "OrderCreated", jdbc.queryForObject(
                "SELECT order_projection_snapshot(?)::text", String.class, orderId));
    }

    // The caller holds the orders row lock. The stream determines command state.
    public long restore(Order order) {
        return jdbc.queryForObject("""
                SELECT max(stream_version), replay_order(?)::text
                FROM order_events WHERE order_id = ?
                """, (rs, row) -> {
            String payload = rs.getString(2);
            if (payload == null) {
                throw new IllegalStateException("Order stream missing for " + order.getId());
            }
            JsonNode state = parse(payload);
            order.setStatus(Order.Status.valueOf(state.required("status").asText()));
            order.setExpiresAt(date(state, "expires_at"));
            order.setPaidAt(date(state, "paid_at"));
            String provider = state.path("payment_provider").asText(null);
            order.setPaymentProvider(provider == null ? null : Order.PaymentProvider.valueOf(provider));
            order.setPaymentRef(state.path("payment_ref").asText(null));
            order.setPaymentUrl(state.path("payment_url").asText(null));
            return rs.getLong(1);
        }, order.getId(), order.getId());
    }

    public void record(Order order, long expectedVersion, Transition transition) {
        ObjectNode patch = json.createObjectNode();
        switch (transition) {
            case OrderCancelled, OrderExpired -> patch.put("status", order.getStatus().name());
            case OrderPaid -> {
                patch.put("status", order.getStatus().name());
                patch.put("paid_at", order.getPaidAt().toString());
                patch.put("payment_provider", order.getPaymentProvider().name());
                patch.put("payment_ref", order.getPaymentRef());
            }
            case OrderPaymentInitiated -> {
                patch.put("payment_provider", order.getPaymentProvider().name());
                patch.put("payment_ref", order.getPaymentRef());
                patch.put("payment_url", order.getPaymentUrl());
            }
        }
        append(order.getId(), expectedVersion, transition.name(), patch.toString());
    }

    private void append(UUID orderId, long expectedVersion, String type, String payload) {
        int inserted = jdbc.update("""
                INSERT INTO order_events (order_id, stream_version, event_type, payload)
                SELECT ?, ?, ?, CAST(? AS jsonb)
                WHERE ? = COALESCE((SELECT max(stream_version) FROM order_events WHERE order_id = ?), 0)
                ON CONFLICT (order_id, stream_version) DO NOTHING
                """, orderId, Math.addExact(expectedVersion, 1), type, payload, expectedVersion, orderId);
        if (inserted != 1) {
            throw new OptimisticLockingFailureException("Order stream changed: " + orderId);
        }
    }

    private JsonNode parse(String payload) {
        try {
            return json.readTree(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Invalid order event payload", e);
        }
    }

    private static OffsetDateTime date(JsonNode state, String field) {
        String value = state.path(field).asText(null);
        return value == null ? null : OffsetDateTime.parse(value);
    }
}
