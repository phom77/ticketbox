ALTER TABLE artist_pdf_jobs
    ADD COLUMN original_file_name VARCHAR(255),
    ADD COLUMN requested_by UUID,
    ADD COLUMN file_checksum VARCHAR(64),
    ADD COLUMN provider VARCHAR(50),
    ADD COLUMN model VARCHAR(100),
    ADD COLUMN extracted_char_count INTEGER,
    ADD COLUMN applied_at TIMESTAMPTZ,
    ADD COLUMN applied_by UUID;

UPDATE artist_pdf_jobs
SET original_file_name = COALESCE(NULLIF(file_url, ''), 'artist-profile.pdf'),
    requested_by = (
        SELECT created_by
        FROM concerts
        WHERE concerts.id = artist_pdf_jobs.concert_id
    ),
    file_checksum = encode(digest(id::text, 'sha256'), 'hex')
WHERE original_file_name IS NULL
   OR requested_by IS NULL
   OR file_checksum IS NULL;

ALTER TABLE artist_pdf_jobs
    ALTER COLUMN original_file_name SET NOT NULL,
    ALTER COLUMN requested_by SET NOT NULL,
    ALTER COLUMN file_checksum SET NOT NULL,
    ADD CONSTRAINT fk_artist_pdf_jobs_requested_by
        FOREIGN KEY (requested_by) REFERENCES users(id),
    ADD CONSTRAINT fk_artist_pdf_jobs_applied_by
        FOREIGN KEY (applied_by) REFERENCES users(id),
    ADD CONSTRAINT chk_artist_pdf_jobs_extracted_char_count
        CHECK (extracted_char_count IS NULL OR extracted_char_count >= 0);

CREATE INDEX idx_artist_pdf_jobs_requested_by
    ON artist_pdf_jobs(requested_by);

CREATE INDEX idx_artist_pdf_jobs_concert_checksum
    ON artist_pdf_jobs(concert_id, file_checksum);
