CREATE TABLE concert_publication_reviews (
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    id uuid PRIMARY KEY,
    concert_id uuid NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    snapshot jsonb NOT NULL,
    publish_at timestamptz NOT NULL,
    state varchar(24) NOT NULL CHECK (state IN (
        'SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED', 'SCHEDULED', 'RELEASED', 'HELD', 'MISSED', 'SUPERSEDED'
    )),
    submitted_by uuid NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    reviewer_id uuid,
    decided_at timestamptz,
    released_at timestamptz,
    reason text,
    held_by uuid,
    held_at timestamptz,
    hold_reason text
);

CREATE INDEX concert_publication_review_latest ON concert_publication_reviews(concert_id, sequence DESC);
CREATE INDEX concert_publication_review_due ON concert_publication_reviews(publish_at) WHERE state = 'SCHEDULED';

CREATE TABLE concert_publication_edits (
    concert_id uuid PRIMARY KEY REFERENCES concerts(id) ON DELETE CASCADE,
    details jsonb NOT NULL
);
