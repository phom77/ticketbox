CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE notification_inbox (
 event_id UUID PRIMARY KEY, event_type TEXT NOT NULL, correlation_id TEXT NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID,
 channel VARCHAR(20) NOT NULL CHECK(channel IN ('APP','EMAIL','SMS','ZALO')),
 event_type VARCHAR(50) NOT NULL, subject VARCHAR(500), body TEXT NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','SENT','FAILED','SKIPPED')),
 sent_at TIMESTAMPTZ, attempts INT NOT NULL DEFAULT 0, last_error TEXT, read_at TIMESTAMPTZ,
 reference_id UUID, message_id UUID UNIQUE,
 delivery_owner UUID, delivery_lease_until TIMESTAMPTZ,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_user_idx ON notifications(user_id,created_at DESC);
CREATE INDEX notification_delivery_idx ON notifications(next_attempt_at) WHERE channel='EMAIL' AND status='PENDING';
CREATE TABLE notification_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), notification_id UUID NOT NULL REFERENCES notifications(id),
 actor_id UUID NOT NULL, action TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
