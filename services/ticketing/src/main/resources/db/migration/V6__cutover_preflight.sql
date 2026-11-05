CREATE TABLE split_seed_fingerprints(table_name TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
CREATE TABLE split_cutover_marker(id INT PRIMARY KEY CHECK(id=1), source_digest TEXT NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now());

INSERT INTO split_seed_fingerprints SELECT 'concerts',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM concerts t;
INSERT INTO split_seed_fingerprints SELECT 'ticket_types',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM ticket_types t;
INSERT INTO split_seed_fingerprints SELECT 'orders',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM orders t;
INSERT INTO split_seed_fingerprints SELECT 'order_items',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM order_items t;
INSERT INTO split_seed_fingerprints SELECT 'tickets',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM tickets t;
INSERT INTO split_seed_fingerprints SELECT 'ticket_holds',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM ticket_holds t;
INSERT INTO split_seed_fingerprints SELECT 'purchase_guards',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM purchase_guards t;
INSERT INTO split_seed_fingerprints SELECT 'ticket_inventory',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM ticket_inventory t;
INSERT INTO split_seed_fingerprints SELECT 'ticketing_payment_intents',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM ticketing_payment_intents t;
INSERT INTO split_seed_fingerprints SELECT 'ticketing_payment_inbox',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM ticketing_payment_inbox t;
INSERT INTO split_seed_fingerprints SELECT 'order_events',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM order_events t;
INSERT INTO split_seed_fingerprints SELECT 'remote_reminder_dispatches',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM remote_reminder_dispatches t;
