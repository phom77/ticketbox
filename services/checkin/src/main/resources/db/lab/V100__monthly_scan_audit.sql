LOCK TABLE scan_audit IN ACCESS EXCLUSIVE MODE;
CREATE TABLE scan_audit_partitioned (LIKE scan_audit INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)
PARTITION BY RANGE (recorded_at);
-- Boundaries are UTC, independent of server/session timezone.
DO $$ DECLARE month date; lower_bound timestamptz; BEGIN
 FOR month IN SELECT generate_series(
   date_trunc('month',now() AT TIME ZONE 'UTC') - interval '1 month',
   date_trunc('month',now() AT TIME ZONE 'UTC') + interval '3 months',interval '1 month')::date LOOP
  lower_bound := month::timestamp AT TIME ZONE 'UTC';
  EXECUTE format('CREATE TABLE scan_audit_%s PARTITION OF scan_audit_partitioned FOR VALUES FROM (%L) TO (%L)',
   to_char(month,'YYYY_MM'),lower_bound,(month + interval '1 month') AT TIME ZONE 'UTC');
 END LOOP;
END $$;
CREATE TABLE scan_audit_default PARTITION OF scan_audit_partitioned DEFAULT;
INSERT INTO scan_audit_partitioned SELECT * FROM scan_audit;
DO $$ BEGIN
 IF EXISTS((SELECT * FROM scan_audit EXCEPT ALL SELECT * FROM scan_audit_partitioned)
           UNION ALL (SELECT * FROM scan_audit_partitioned EXCEPT ALL SELECT * FROM scan_audit)) THEN
  RAISE EXCEPTION 'Audit migration row mismatch';
 END IF;
END $$;
ALTER TABLE scan_audit RENAME TO scan_audit_unpartitioned;
ALTER TABLE scan_audit_partitioned RENAME TO scan_audit;
DROP TABLE scan_audit_unpartitioned;
COMMENT ON TABLE scan_audit IS 'Append-only accepted admissions; lab monthly UTC range partitions';
DO $$ DECLARE child regclass; BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='checkin_runtime') THEN
  GRANT SELECT,INSERT ON scan_audit TO checkin_runtime;
  REVOKE UPDATE,DELETE,TRUNCATE ON scan_audit FROM checkin_runtime;
  FOR child IN SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent='scan_audit'::regclass LOOP
   EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON %s FROM checkin_runtime',child);
  END LOOP;
 END IF;
END $$;
-- Owner-operated maintenance: move any matching default rows before attaching.
CREATE FUNCTION ensure_scan_audit_month(target_month date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE first_day date := date_trunc('month',target_month)::date;
        next_day date := (first_day + interval '1 month')::date;
        child text := 'scan_audit_' || to_char(first_day,'YYYY_MM');
BEGIN
 LOCK TABLE scan_audit IN ACCESS EXCLUSIVE MODE;
 IF to_regclass('public.' || child) IS NOT NULL THEN
  IF NOT EXISTS(SELECT FROM pg_inherits WHERE inhparent='scan_audit'::regclass AND inhrelid=to_regclass('public.' || child)) THEN
   RAISE EXCEPTION 'Existing relation % is not an audit partition',child;
  END IF;
  RETURN;
 END IF;
 EXECUTE format('CREATE TABLE %I (LIKE scan_audit INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)',child);
 EXECUTE format('WITH moved AS (DELETE FROM scan_audit_default WHERE recorded_at >= %L AND recorded_at < %L RETURNING *) INSERT INTO %I SELECT * FROM moved',
  first_day::timestamp AT TIME ZONE 'UTC',next_day::timestamp AT TIME ZONE 'UTC',child);
 EXECUTE format('ALTER TABLE scan_audit ATTACH PARTITION %I FOR VALUES FROM (%L) TO (%L)',
  child,first_day::timestamp AT TIME ZONE 'UTC',next_day::timestamp AT TIME ZONE 'UTC');
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='checkin_runtime') THEN
  EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON %I FROM checkin_runtime',child);
 END IF;
END $$;
REVOKE EXECUTE ON FUNCTION ensure_scan_audit_month(date) FROM PUBLIC;
ANALYZE scan_audit;
