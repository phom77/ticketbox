CREATE TABLE performance_disruptions (
    id UUID PRIMARY KEY,
    performance_id UUID NOT NULL REFERENCES performances(id),
    kind TEXT NOT NULL CHECK (kind IN ('CANCEL','POSTPONE')),
    reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
    actor_id UUID NOT NULL,
    event_date TIMESTAMPTZ,
    command JSONB NOT NULL,
    pause_version BIGINT NOT NULL,
    resume_version BIGINT,
    resumed_by UUID,
    dispatched_at TIMESTAMPTZ,
    retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (performance_id,pause_version) REFERENCES performance_sale_publications(performance_id,version),
    FOREIGN KEY (performance_id,resume_version) REFERENCES performance_sale_publications(performance_id,version),
    CHECK ((kind='POSTPONE') = (event_date IS NOT NULL)),
    CHECK ((resumed_by IS NOT NULL) = (resume_version IS NOT NULL))
);
CREATE UNIQUE INDEX performance_disruption_once_idx
    ON performance_disruptions(performance_id) WHERE resume_version IS NULL;
