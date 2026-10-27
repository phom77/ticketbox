ALTER TABLE concerts
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

-- Keep the seeded scanner fixture available to staff while hiding it from the
-- customer-facing discovery catalog.
UPDATE concerts
SET is_public = FALSE,
    updated_at = NOW()
WHERE id = '70000000-0000-0000-0000-000000000001';
