ALTER TABLE batch_logs
    DROP CONSTRAINT chk_batch_logs_status;

ALTER TABLE batch_logs
    ADD COLUMN concert_id UUID REFERENCES concerts(id),
    ADD COLUMN source VARCHAR(20),
    ADD COLUMN checksum VARCHAR(64),
    ADD COLUMN file_path VARCHAR(1000),
    ADD COLUMN error_report_path VARCHAR(1000);

ALTER TABLE batch_logs
    ADD CONSTRAINT chk_batch_logs_status
        CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED')),
    ADD CONSTRAINT chk_batch_logs_source
        CHECK (source IS NULL OR source IN ('UPLOAD', 'SCHEDULED'));

CREATE INDEX idx_batch_logs_concert ON batch_logs(concert_id);
CREATE INDEX idx_batch_logs_checksum ON batch_logs(concert_id, checksum);

CREATE UNIQUE INDEX uq_batch_logs_active_checksum
    ON batch_logs(concert_id, checksum)
    WHERE checksum IS NOT NULL AND status IN ('RUNNING', 'SUCCESS', 'PARTIAL');

CREATE TABLE guest_list_staging (
    id BIGSERIAL PRIMARY KEY,
    batch_log_id UUID NOT NULL REFERENCES batch_logs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    concert_id UUID NOT NULL REFERENCES concerts(id),
    normalized_phone VARCHAR(20),
    full_name VARCHAR(255),
    category VARCHAR(100),
    sponsor_name VARCHAR(255),
    notes TEXT,
    validation_error TEXT,
    CONSTRAINT uq_guest_list_staging_row UNIQUE (batch_log_id, row_number)
);

CREATE INDEX idx_guest_list_staging_batch
    ON guest_list_staging(batch_log_id);

CREATE TABLE shedlock (
    name VARCHAR(64) NOT NULL PRIMARY KEY,
    lock_until TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL,
    locked_by VARCHAR(255) NOT NULL
);
