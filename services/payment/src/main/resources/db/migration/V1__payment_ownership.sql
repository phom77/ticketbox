CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE payment_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),intent_id UUID NOT NULL UNIQUE,order_id UUID NOT NULL UNIQUE,
 user_id UUID NOT NULL,provider VARCHAR(20) NOT NULL CHECK(provider IN ('MOCK','MOMO','VNPAY')),
 amount NUMERIC(12,0) NOT NULL CHECK(amount>=0),currency VARCHAR(3) NOT NULL CHECK(currency='VND'),
 order_version BIGINT NOT NULL CHECK(order_version=1),request_id VARCHAR(100) NOT NULL UNIQUE,correlation_id VARCHAR(200) NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,state VARCHAR(40) NOT NULL, payment_url TEXT,raw_payload TEXT,
 provider_transaction_id TEXT,query_count INT NOT NULL DEFAULT 0,next_query_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '2 minutes',
 lease_owner UUID,lease_until TIMESTAMPTZ,last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_provider_tx ON payment_attempts(provider,provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
CREATE TABLE payment_result_outbox (
 event_id UUID PRIMARY KEY,intent_id UUID NOT NULL UNIQUE REFERENCES payment_attempts(intent_id),payload TEXT NOT NULL,
 attempts INT NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),lease_owner UUID,lease_until TIMESTAMPTZ,
 last_error TEXT,completed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL,actor_id UUID,
 action TEXT NOT NULL,detail TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE refund_reviews (
 request_id UUID PRIMARY KEY,intent_id UUID NOT NULL REFERENCES payment_attempts(intent_id),
 order_id UUID NOT NULL,provider VARCHAR(20) NOT NULL,transaction_id TEXT NOT NULL,amount NUMERIC(12,0) NOT NULL,
 state VARCHAR(30) NOT NULL DEFAULT 'REVIEW_REQUIRED',reason TEXT NOT NULL,external_reference TEXT,
 resolved_by UUID,resolved_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refund_provider_tx ON refund_reviews(provider,transaction_id);
CREATE UNIQUE INDEX refund_external_ref ON refund_reviews(provider,external_reference) WHERE external_reference IS NOT NULL;
