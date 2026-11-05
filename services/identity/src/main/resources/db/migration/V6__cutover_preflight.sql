CREATE TABLE split_seed_fingerprints(table_name TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);
CREATE TABLE split_cutover_marker(id INT PRIMARY KEY CHECK(id=1), source_digest TEXT NOT NULL, completed_at TIMESTAMPTZ NOT NULL DEFAULT now());

INSERT INTO split_seed_fingerprints SELECT 'users',md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) FROM users t;
