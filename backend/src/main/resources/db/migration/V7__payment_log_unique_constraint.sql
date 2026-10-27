-- Add unique constraint to prevent duplicate payment success/failure events for the same order
-- This is the DB-level guard against race conditions in PaymentService.existsByOrderIdAndEventType → insert
ALTER TABLE payment_logs
    ADD CONSTRAINT uq_payment_logs_order_event UNIQUE (order_id, event_type);
