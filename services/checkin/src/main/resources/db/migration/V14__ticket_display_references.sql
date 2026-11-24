ALTER TABLE tickets
    ADD COLUMN reference_code VARCHAR(32),
    ADD COLUMN ticket_type_name VARCHAR(500);
