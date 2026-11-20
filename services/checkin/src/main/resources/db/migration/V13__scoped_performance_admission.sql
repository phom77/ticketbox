ALTER TABLE concerts
    ADD COLUMN performance_snapshot_version BIGINT CHECK (performance_snapshot_version > 0),
    ADD COLUMN performance_snapshot_digest TEXT,
    ALTER COLUMN created_by DROP NOT NULL,
    ADD CONSTRAINT checkin_concert_source CHECK (
        (performance_snapshot_version IS NULL AND performance_snapshot_digest IS NULL AND created_by IS NOT NULL)
        OR (performance_snapshot_version IS NOT NULL AND performance_snapshot_digest IS NOT NULL)
    );

ALTER TABLE ticket_types ADD COLUMN performance_offer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ticket_types DROP CONSTRAINT uq_ticket_types_concert_name;
CREATE UNIQUE INDEX checkin_legacy_ticket_type_name
    ON ticket_types(concert_id, name) WHERE NOT performance_offer;

ALTER TABLE tickets
    ADD COLUMN section_label TEXT,
    ADD COLUMN row_label TEXT,
    ADD COLUMN seat_label TEXT;

CREATE TABLE staff_admission_assignments (
    concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL,
    granted_by UUID NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_by UUID,
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (concert_id, staff_id),
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE INDEX checkin_active_staff_assignments
    ON staff_admission_assignments(staff_id, concert_id) WHERE revoked_at IS NULL;
