-- Records that the confirmed refund returned the order's stock to sale (ADR 0004), so a replayed result cannot do it twice.
ALTER TABLE order_refunds ADD COLUMN stock_released BOOLEAN NOT NULL DEFAULT FALSE;
