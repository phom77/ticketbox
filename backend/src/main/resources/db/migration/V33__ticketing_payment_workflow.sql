CREATE TABLE ticketing_payment_intents (
 order_id UUID PRIMARY KEY REFERENCES orders(id), intent_id UUID NOT NULL UNIQUE,
 user_id UUID NOT NULL, provider VARCHAR(20) NOT NULL CHECK(provider IN ('MOCK','MOMO','VNPAY')),
 amount NUMERIC(12,0) NOT NULL CHECK(amount>=0), currency VARCHAR(3) NOT NULL CHECK(currency='VND'),
 order_version BIGINT NOT NULL DEFAULT 1 CHECK(order_version=1), request_id VARCHAR(100) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL, state VARCHAR(30) NOT NULL DEFAULT 'CREATED',
 attempt_id UUID, payment_url TEXT, provider_ref TEXT, transaction_id TEXT,
 lease_owner UUID, lease_until TIMESTAMPTZ, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 attempts INT NOT NULL DEFAULT 0, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ticketing_provider_transaction ON ticketing_payment_intents(provider,transaction_id) WHERE transaction_id IS NOT NULL;
CREATE TABLE ticketing_payment_inbox (
 event_id UUID PRIMARY KEY, intent_id UUID NOT NULL, decision VARCHAR(20) NOT NULL,
 reason TEXT NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_cutover_control (id INT PRIMARY KEY CHECK(id=1), mode VARCHAR(20) NOT NULL);
