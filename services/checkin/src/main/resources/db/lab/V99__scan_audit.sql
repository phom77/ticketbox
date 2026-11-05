-- Accepted admission snapshots. checkin_logs remains the unique admission authority.
CREATE TABLE scan_audit (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    ticket_id UUID NOT NULL,
    concert_id UUID NOT NULL,
    staff_id UUID,
    device_id VARCHAR(255),
    is_offline BOOLEAN NOT NULL,
    gate VARCHAR(50),
    PRIMARY KEY (recorded_at, id)
);
CREATE INDEX scan_audit_concert_time_idx ON scan_audit(concert_id, recorded_at);
COMMENT ON TABLE scan_audit IS 'Append-only accepted admission snapshots; denied scan attempts are not recorded here';
INSERT INTO scan_audit(id,recorded_at,ticket_id,concert_id,staff_id,device_id,is_offline,gate)
SELECT id,created_at,ticket_id,concert_id,staff_id,device_id,is_offline,gate FROM checkin_logs;
CREATE FUNCTION audit_accepted_scan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO scan_audit(id,recorded_at,ticket_id,concert_id,staff_id,device_id,is_offline,gate)
 VALUES(NEW.id,NEW.created_at,NEW.ticket_id,NEW.concert_id,NEW.staff_id,NEW.device_id,NEW.is_offline,NEW.gate);
 RETURN NEW;
END $$;
CREATE TRIGGER audit_accepted_scan AFTER INSERT ON checkin_logs
FOR EACH ROW EXECUTE FUNCTION audit_accepted_scan();
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='checkin_runtime') THEN
  GRANT SELECT,INSERT ON scan_audit TO checkin_runtime;
  REVOKE UPDATE,DELETE,TRUNCATE ON scan_audit FROM checkin_runtime;
 END IF;
END $$;
