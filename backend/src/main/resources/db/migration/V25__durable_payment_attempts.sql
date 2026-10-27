CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    provider VARCHAR(255) NOT NULL,
    request_id VARCHAR(255) NOT NULL UNIQUE,
    amount NUMERIC(12,0) NOT NULL,
    state VARCHAR(255) NOT NULL CHECK (state IN ('PROCESSING','READY','UNKNOWN','FAILED','SUCCEEDED','RECONCILIATION_REQUIRED','REVIEW_REQUIRED')),
    payment_url TEXT,
    provider_transaction_id VARCHAR(255),
    raw_payload TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    next_query_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ,
    lease_owner UUID,
    query_count INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_attempt_due_idx ON payment_attempts(next_query_at)
    WHERE state IN ('PROCESSING','UNKNOWN','READY');
INSERT INTO payment_attempts (id,order_id,provider,request_id,amount,state,payment_url,expires_at,next_query_at)
SELECT gen_random_uuid(),id,payment_provider,
       CASE WHEN payment_provider = 'MOMO' AND payment_ref IS NOT NULL THEN payment_ref ELSE id::text END,
       total_amount,'READY',payment_url,expires_at,now() + interval '1 minute'
FROM orders WHERE status = 'AWAITING_PAYMENT' AND payment_url IS NOT NULL AND payment_provider IS NOT NULL;
