ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;

DROP INDEX IF EXISTS idx_orders_idempotency;

ALTER TABLE orders
    ADD CONSTRAINT uq_orders_user_idempotency
        UNIQUE (user_id, idempotency_key);

ALTER TABLE notifications
    ADD COLUMN message_id UUID;

CREATE UNIQUE INDEX uq_notifications_message_id
    ON notifications(message_id)
    WHERE message_id IS NOT NULL;

ALTER TABLE orders ALTER COLUMN idempotency_key SET NOT NULL;