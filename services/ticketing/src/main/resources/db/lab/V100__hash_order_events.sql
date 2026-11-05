-- Offline lab conversion. Flyway runs this transaction before application startup.
LOCK TABLE order_events IN ACCESS EXCLUSIVE MODE;
CREATE TABLE order_events_partitioned (LIKE order_events INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
PARTITION BY HASH (order_id);
ALTER TABLE order_events_partitioned ADD PRIMARY KEY(order_id,stream_version);
CREATE TABLE order_events_h0 PARTITION OF order_events_partitioned FOR VALUES WITH (MODULUS 4,REMAINDER 0);
CREATE TABLE order_events_h1 PARTITION OF order_events_partitioned FOR VALUES WITH (MODULUS 4,REMAINDER 1);
CREATE TABLE order_events_h2 PARTITION OF order_events_partitioned FOR VALUES WITH (MODULUS 4,REMAINDER 2);
CREATE TABLE order_events_h3 PARTITION OF order_events_partitioned FOR VALUES WITH (MODULUS 4,REMAINDER 3);
INSERT INTO order_events_partitioned SELECT * FROM order_events;
DO $$ BEGIN
 IF EXISTS((SELECT * FROM order_events EXCEPT ALL SELECT * FROM order_events_partitioned)
           UNION ALL (SELECT * FROM order_events_partitioned EXCEPT ALL SELECT * FROM order_events)) THEN
  RAISE EXCEPTION 'Event migration row mismatch';
 END IF;
END $$;
ALTER TABLE order_events RENAME TO order_events_unpartitioned;
ALTER TABLE order_events_partitioned RENAME TO order_events;
-- RESTRICT intentionally aborts if an unexpected dependency has been introduced.
DROP TABLE order_events_unpartitioned;
COMMENT ON TABLE order_events IS 'Append-only Order stream; lab hash partitioned by order_id';
DO $$ DECLARE child regclass; BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='ticketing_runtime') THEN
  GRANT SELECT,INSERT ON order_events TO ticketing_runtime;
  REVOKE UPDATE,DELETE,TRUNCATE ON order_events FROM ticketing_runtime;
  FOR child IN SELECT inhrelid::regclass FROM pg_inherits WHERE inhparent='order_events'::regclass LOOP
   EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE ON %s FROM ticketing_runtime',child);
  END LOOP;
 END IF;
END $$;
ANALYZE order_events;
