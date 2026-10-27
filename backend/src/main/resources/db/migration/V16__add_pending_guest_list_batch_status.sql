ALTER TABLE batch_logs
    DROP CONSTRAINT chk_batch_logs_status;

ALTER TABLE batch_logs
    ADD CONSTRAINT chk_batch_logs_status
        CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED'));

DROP INDEX uq_batch_logs_active_checksum;

CREATE UNIQUE INDEX uq_batch_logs_active_checksum
    ON batch_logs(concert_id, checksum)
    WHERE checksum IS NOT NULL
      AND status IN ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL');
