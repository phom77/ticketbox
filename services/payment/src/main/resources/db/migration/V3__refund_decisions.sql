ALTER TABLE refund_reviews ADD COLUMN requested_by UUID;
ALTER TABLE refund_reviews ADD COLUMN approved_by UUID;
ALTER TABLE refund_reviews ADD COLUMN provider_refunded_at TIMESTAMPTZ;

CREATE TABLE refund_result_outbox (
    case_id UUID PRIMARY KEY REFERENCES refund_reviews(request_id),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX refund_result_pending_idx ON refund_result_outbox(next_attempt_at,case_id) WHERE delivered_at IS NULL;
