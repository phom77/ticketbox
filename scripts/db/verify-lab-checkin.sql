\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT relkind FROM pg_class WHERE oid='scan_audit'::regclass) <> 'p' THEN
  RAISE EXCEPTION 'Expected range-partitioned scan audit';
 END IF;
 IF EXISTS(SELECT FROM checkin_logs l WHERE NOT EXISTS(SELECT FROM scan_audit a WHERE a.id=l.id AND a.recorded_at=l.created_at)) THEN
  RAISE EXCEPTION 'Accepted admission missing from audit';
 END IF;
 BEGIN
  INSERT INTO checkin_logs(id,ticket_id,concert_id,checked_at,is_offline)
  SELECT gen_random_uuid(),gen_random_uuid(),id,now(),false FROM concerts LIMIT 1;
  RAISE EXCEPTION 'Missing ticket FK accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF EXISTS(SELECT FROM checkin_logs) THEN
  BEGIN
   INSERT INTO checkin_logs(id,ticket_id,concert_id,checked_at,is_offline)
   SELECT gen_random_uuid(),ticket_id,concert_id,now(),false FROM checkin_logs LIMIT 1;
   RAISE EXCEPTION 'Duplicate admission accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
   INSERT INTO scan_audit SELECT * FROM scan_audit LIMIT 1;
   RAISE EXCEPTION 'Duplicate audit key accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
 END IF;
 IF EXISTS(SELECT FROM pg_constraint WHERE conrelid IN ('scan_audit'::regclass,'checkin_logs'::regclass) AND NOT convalidated) THEN
  RAISE EXCEPTION 'Unvalidated constraint after migration';
 END IF;
 IF has_table_privilege('checkin_runtime','scan_audit','DELETE') OR
    has_table_privilege('checkin_runtime','scan_audit','UPDATE') OR EXISTS(
      SELECT FROM pg_inherits WHERE inhparent='scan_audit'::regclass AND
      (has_table_privilege('checkin_runtime',inhrelid,'UPDATE') OR
       has_table_privilege('checkin_runtime',inhrelid,'DELETE') OR
       has_table_privilege('checkin_runtime',inhrelid,'TRUNCATE'))) THEN
  RAISE EXCEPTION 'Runtime can mutate audit history';
 END IF;
END $$;
SELECT jsonb_build_object('table','scan_audit','partitions',
 (SELECT jsonb_agg(inhrelid::regclass::text ORDER BY inhrelid::regclass::text)
 FROM pg_inherits WHERE inhparent='scan_audit'::regclass),'rows',(SELECT count(*) FROM scan_audit),'checksPassed',true);
