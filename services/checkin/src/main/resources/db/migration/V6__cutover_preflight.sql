CREATE TABLE split_seed_fingerprints(table_name TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
CREATE TABLE split_cutover_marker(id INT PRIMARY KEY CHECK(id=1), source_digest TEXT NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now());

INSERT INTO split_seed_fingerprints SELECT 'checkin_logs',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM checkin_logs t;
INSERT INTO split_seed_fingerprints SELECT 'guest_lists',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM guest_lists t;
INSERT INTO split_seed_fingerprints SELECT 'batch_logs',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM batch_logs t;
INSERT INTO split_seed_fingerprints SELECT 'guest_list_staging',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM guest_list_staging t;
