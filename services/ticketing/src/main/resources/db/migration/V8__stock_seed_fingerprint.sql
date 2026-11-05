-- Applying an identical catalog snapshot refreshes operational updated_at.
-- Compare stock quantities and revision while excluding that transport timestamp.
UPDATE split_seed_fingerprints SET fingerprint=(
 SELECT md5(COALESCE(string_agg((to_jsonb(t)-'updated_at')::text,E'\n'
 ORDER BY (to_jsonb(t)-'updated_at')::text),'')) FROM ticket_inventory t
) WHERE table_name='ticket_inventory';
