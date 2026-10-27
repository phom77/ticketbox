ALTER TABLE notifications ADD COLUMN delivery_owner UUID;
ALTER TABLE notifications ADD COLUMN delivery_lease_until TIMESTAMPTZ;
CREATE INDEX pending_email_recovery_idx ON notifications(updated_at)
    WHERE channel='EMAIL' AND status='PENDING';
