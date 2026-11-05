-- Flyway runs this migration in one transaction. Stop old Core writers before upgrading.
LOCK TABLE orders, order_items IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE order_events (
    order_id UUID NOT NULL,
    stream_version BIGINT NOT NULL CHECK (stream_version > 0),
    event_type TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (order_id, stream_version),
    CHECK (
        (stream_version = 1 AND event_type IN ('OrderCreated', 'OrderImported'))
        OR
        (stream_version > 1 AND event_type IN ('OrderPaymentInitiated', 'OrderPaid', 'OrderExpired', 'OrderCancelled'))
    )
);

CREATE FUNCTION order_projection_snapshot(target_order UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT to_jsonb(o) || jsonb_build_object('items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)
         FROM order_items i WHERE i.order_id = o.id), '[]'::jsonb))
    FROM orders o WHERE o.id = target_order
$$;

INSERT INTO order_events (order_id, stream_version, event_type, payload)
SELECT id, 1, 'OrderImported', order_projection_snapshot(id)
FROM orders;

-- Version 1 payloads are top-level patches. Explicit JSON null clears a value.
CREATE FUNCTION replay_order(target_order UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT jsonb_object_agg(key, value)
    FROM (
        SELECT DISTINCT ON (field.key) field.key, field.value
        FROM order_events e
        CROSS JOIN LATERAL jsonb_each(e.payload) field
        WHERE e.order_id = target_order
        ORDER BY field.key, e.stream_version DESC
    ) latest
$$;

DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'core_runtime') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON order_events FROM core_runtime;
    END IF;
END $$;
