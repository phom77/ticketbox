-- Event content on native events: poster, translations, artist bio, age rating and refund policy.
ALTER TABLE events
    ADD COLUMN poster_url TEXT,
    ADD COLUMN poster_public_id TEXT,
    ADD COLUMN localized_content TEXT,
    ADD COLUMN artist_bio TEXT,
    ADD COLUMN age_rating TEXT CHECK (age_rating IS NULL OR age_rating IN ('ALL', '13+', '16+', '18+')),
    ADD COLUMN refund_policy TEXT CHECK (refund_policy IS NULL OR length(refund_policy) <= 2000),
    -- Optimistic lock of the content editors. draft_version stays the token of the publication review.
    ADD COLUMN content_version BIGINT NOT NULL DEFAULT 0;

-- One pending content revision per event; edits after release wait here until a reviewer approves them.
CREATE TABLE event_content_revisions (
    event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL CHECK (revision > 0),
    base_content_version BIGINT NOT NULL CHECK (base_content_version >= 0),
    details JSONB NOT NULL,
    poster_changed BOOLEAN NOT NULL DEFAULT false,
    poster_url TEXT,
    poster_public_id TEXT,
    state VARCHAR(24) NOT NULL CHECK (state IN ('DRAFTING', 'SUBMITTED', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED')),
    submitted_by UUID,
    submitted_at TIMESTAMPTZ,
    reviewer_id UUID,
    decided_at TIMESTAMPTZ,
    reason VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX event_content_revisions_queue ON event_content_revisions(state, submitted_at);

-- Artist bio jobs belong to a legacy concert or to a native event, never both.
ALTER TABLE artist_pdf_jobs ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE artist_pdf_jobs ALTER COLUMN concert_id DROP NOT NULL;
ALTER TABLE artist_pdf_jobs ADD CONSTRAINT chk_artist_pdf_jobs_subject
    CHECK ((concert_id IS NULL) <> (event_id IS NULL));
CREATE INDEX artist_pdf_jobs_event_idx ON artist_pdf_jobs(event_id) WHERE event_id IS NOT NULL;

-- Deleting a draft performance must not delete backgrounds shared with templates and other performances.
ALTER TABLE layout_backgrounds ALTER COLUMN source_performance_id DROP NOT NULL;
ALTER TABLE layout_backgrounds DROP CONSTRAINT layout_backgrounds_source_performance_id_fkey;
ALTER TABLE layout_backgrounds ADD CONSTRAINT layout_backgrounds_source_performance_id_fkey
    FOREIGN KEY (source_performance_id) REFERENCES performances(id) ON DELETE SET NULL;

-- Who deleted or decided what, for organizer-facing destructive actions and content reviews.
CREATE TABLE organizer_audit_log (
    id UUID PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_id UUID NOT NULL,
    organization_id UUID,
    action VARCHAR(64) NOT NULL,
    subject_id UUID NOT NULL,
    details TEXT
);
CREATE INDEX organizer_audit_log_subject ON organizer_audit_log(subject_id, occurred_at DESC);
