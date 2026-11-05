

CREATE TABLE public.artist_pdf_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concert_id uuid NOT NULL,
    file_url character varying(500) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    result_bio text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    original_file_name character varying(255) NOT NULL,
    requested_by uuid NOT NULL,
    file_checksum character varying(64) NOT NULL,
    provider character varying(50),
    model character varying(100),
    extracted_char_count integer,
    applied_at timestamp with time zone,
    applied_by uuid,
    CONSTRAINT chk_artist_pdf_jobs_extracted_char_count CHECK (((extracted_char_count IS NULL) OR (extracted_char_count >= 0))),
    CONSTRAINT chk_artist_pdf_jobs_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'DONE'::character varying, 'FAILED'::character varying])::text[])))
);

CREATE TABLE public.concerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    artist_bio text,
    venue_name character varying(500) NOT NULL,
    venue_address text NOT NULL,
    event_date timestamp with time zone NOT NULL,
    doors_open_at timestamp with time zone,
    sale_start_at timestamp with time zone DEFAULT now() NOT NULL,
    sale_end_at timestamp with time zone,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    seat_map_svg text,
    poster_url character varying(500),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    poster_public_id character varying(500),
    is_public boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_concerts_status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ON_SALE'::character varying, 'SOLD_OUT'::character varying, 'CANCELLED'::character varying, 'COMPLETED'::character varying])::text[])))
);

CREATE TABLE public.event_publication (
    id uuid NOT NULL,
    listener_id character varying(512) NOT NULL,
    event_type character varying(512) NOT NULL,
    serialized_event character varying(4000) NOT NULL,
    publication_date timestamp with time zone NOT NULL,
    completion_date timestamp with time zone
);

CREATE TABLE public.shedlock (
    name character varying(64) NOT NULL,
    lock_until timestamp with time zone NOT NULL,
    locked_at timestamp with time zone NOT NULL,
    locked_by character varying(255) NOT NULL
);

CREATE TABLE public.ticket_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concert_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    price numeric(12,0) NOT NULL,
    total_quantity integer NOT NULL,
    available_qty integer NOT NULL,
    max_per_account integer DEFAULT 4 NOT NULL,
    zone_color character varying(7),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ticket_types_available_qty_non_negative CHECK ((available_qty >= 0)),
    CONSTRAINT chk_ticket_types_max_per_account_positive CHECK ((max_per_account > 0)),
    CONSTRAINT chk_ticket_types_price_non_negative CHECK ((price >= (0)::numeric)),
    CONSTRAINT chk_ticket_types_total_quantity_positive CHECK ((total_quantity > 0))
);

COMMENT ON COLUMN public.ticket_types.available_qty IS 'Frozen migration snapshot; operational reads and writes use ticket_inventory';

ALTER TABLE ONLY public.artist_pdf_jobs
    ADD CONSTRAINT artist_pdf_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.concerts
    ADD CONSTRAINT concerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_publication
    ADD CONSTRAINT event_publication_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shedlock
    ADD CONSTRAINT shedlock_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT uq_ticket_types_concert_name UNIQUE (concert_id, name);

CREATE INDEX idx_artist_pdf_jobs_concert ON public.artist_pdf_jobs USING btree (concert_id);

CREATE INDEX idx_artist_pdf_jobs_concert_checksum ON public.artist_pdf_jobs USING btree (concert_id, file_checksum);

CREATE INDEX idx_artist_pdf_jobs_requested_by ON public.artist_pdf_jobs USING btree (requested_by);

CREATE INDEX idx_artist_pdf_jobs_status ON public.artist_pdf_jobs USING btree (status);

CREATE INDEX idx_concerts_created_by ON public.concerts USING btree (created_by);

CREATE INDEX idx_concerts_created_by_status_event_date ON public.concerts USING btree (created_by, status, event_date);

CREATE INDEX idx_concerts_event_date ON public.concerts USING btree (event_date);

CREATE INDEX idx_concerts_status ON public.concerts USING btree (status);

CREATE INDEX idx_concerts_status_date ON public.concerts USING btree (status, event_date);

CREATE INDEX idx_event_pub_completion ON public.event_publication USING btree (completion_date);

CREATE INDEX idx_ticket_types_concert ON public.ticket_types USING btree (concert_id);

ALTER TABLE ONLY public.artist_pdf_jobs
    ADD CONSTRAINT artist_pdf_jobs_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id) ON DELETE RESTRICT;

