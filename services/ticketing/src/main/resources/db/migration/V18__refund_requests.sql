CREATE TABLE refund_requests (
    id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES orders(id),
    buyer_id uuid NOT NULL,
    reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    origin varchar(12) NOT NULL CHECK (origin IN ('BUYER', 'POSTPONEMENT')),
    status varchar(12) NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REFUNDED', 'FAILED')),
    decided_by uuid,
    decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    payment_case_id uuid,
    CHECK ((status = 'REQUESTED') = (decided_at IS NULL)),
    CHECK (status <> 'REJECTED' OR (decision_note IS NOT NULL AND decided_by IS NOT NULL))
);

-- One open request per order; an approved request stays open until the refund is confirmed or aborted.
CREATE UNIQUE INDEX one_open_refund_request_per_order ON refund_requests (order_id) WHERE status IN ('REQUESTED', 'APPROVED');
CREATE INDEX refund_requests_by_order ON refund_requests (order_id, created_at DESC);
CREATE INDEX refund_requests_by_case ON refund_requests (payment_case_id) WHERE payment_case_id IS NOT NULL;
CREATE INDEX refund_requests_open_queue ON refund_requests (created_at) WHERE status IN ('REQUESTED', 'APPROVED');
