ALTER TABLE payment_attempts ADD COLUMN verified_at TIMESTAMPTZ;

UPDATE payment_attempts a
SET verified_at = COALESCE((o.payload::jsonb ->> 'occurredAt')::timestamptz, o.created_at)
FROM payment_result_outbox o WHERE o.intent_id = a.intent_id;

CREATE TABLE payment_reconciliation_outbox (
    intent_id UUID PRIMARY KEY REFERENCES payment_attempts(intent_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 1,
    delivered_revision BIGINT NOT NULL DEFAULT 0,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX payment_reconciliation_pending_idx ON payment_reconciliation_outbox(next_attempt_at, intent_id)
    WHERE revision > delivered_revision;

CREATE FUNCTION enqueue_payment_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID;
BEGIN
    target = COALESCE(NEW.intent_id, OLD.intent_id);
    INSERT INTO payment_reconciliation_outbox(intent_id) VALUES (target)
    ON CONFLICT (intent_id) DO UPDATE SET revision = payment_reconciliation_outbox.revision + 1,
        changed_at = clock_timestamp(), next_attempt_at = clock_timestamp();
    RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER payment_attempt_reporting AFTER INSERT OR UPDATE OF state, provider_transaction_id, verified_at
ON payment_attempts FOR EACH ROW EXECUTE FUNCTION enqueue_payment_reconciliation();

CREATE TRIGGER refund_review_reporting AFTER INSERT OR UPDATE OF state, external_reference
ON refund_reviews FOR EACH ROW EXECUTE FUNCTION enqueue_payment_reconciliation();

INSERT INTO payment_reconciliation_outbox(intent_id) SELECT intent_id FROM payment_attempts;
