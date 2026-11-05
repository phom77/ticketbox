\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT relkind FROM pg_class WHERE oid='order_events'::regclass) <> 'p' OR
    (SELECT count(*) FROM pg_inherits WHERE inhparent='order_events'::regclass) <> 4 THEN
  RAISE EXCEPTION 'Expected four hash partitions';
 END IF;
 -- Same normalization as verify-order-replay.sql: updated_at is projection
 -- metadata and paid_at may be encoded by Java with nanoseconds/UTC Z.
 IF EXISTS(SELECT FROM orders o WHERE
    (replay_order(id) - 'updated_at' - 'paid_at') IS DISTINCT FROM
       (order_projection_snapshot(id) - 'updated_at' - 'paid_at') OR
    (replay_order(id)->>'paid_at')::timestamptz IS DISTINCT FROM o.paid_at) THEN
  RAISE EXCEPTION 'Order replay differs from projection';
 END IF;
 BEGIN
  INSERT INTO order_events SELECT * FROM order_events LIMIT 1;
  RAISE EXCEPTION 'Duplicate stream version accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO order_events(order_id,stream_version,event_type,payload) VALUES(gen_random_uuid(),1,'OrderPaid','{}');
  RAISE EXCEPTION 'Invalid first event accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO order_events(order_id,stream_version,event_type,payload) VALUES(gen_random_uuid(),1,'OrderCreated','[]');
  RAISE EXCEPTION 'Non-object payload accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_table_privilege('ticketing_runtime','order_events','UPDATE') OR
    has_table_privilege('ticketing_runtime','order_events','DELETE') OR
    has_table_privilege('ticketing_runtime','order_events','TRUNCATE') OR EXISTS(
      SELECT FROM pg_inherits WHERE inhparent='order_events'::regclass AND
      (has_table_privilege('ticketing_runtime',inhrelid,'UPDATE') OR
       has_table_privilege('ticketing_runtime',inhrelid,'DELETE') OR
       has_table_privilege('ticketing_runtime',inhrelid,'TRUNCATE'))) THEN
  RAISE EXCEPTION 'Runtime can mutate historical events';
 END IF;
END $$;
SELECT jsonb_build_object('table','order_events','partitions',
 (SELECT jsonb_agg(inhrelid::regclass::text ORDER BY inhrelid::regclass::text)
 FROM pg_inherits WHERE inhparent='order_events'::regclass),'rows',(SELECT count(*) FROM order_events),'checksPassed',true);
