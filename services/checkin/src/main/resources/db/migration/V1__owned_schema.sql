

CREATE TABLE public.batch_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name character varying(100) NOT NULL,
    file_name character varying(255),
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    status character varying(20) NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    success_rows integer DEFAULT 0 NOT NULL,
    error_rows integer DEFAULT 0 NOT NULL,
    error_detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    concert_id uuid,
    source character varying(20),
    checksum character varying(64),
    file_path character varying(1000),
    error_report_path character varying(1000),
    CONSTRAINT chk_batch_logs_row_counts_non_negative CHECK (((total_rows >= 0) AND (success_rows >= 0) AND (error_rows >= 0))),
    CONSTRAINT chk_batch_logs_source CHECK (((source IS NULL) OR ((source)::text = ANY ((ARRAY['UPLOAD'::character varying, 'SCHEDULED'::character varying])::text[])))),
    CONSTRAINT chk_batch_logs_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'RUNNING'::character varying, 'SUCCESS'::character varying, 'PARTIAL'::character varying, 'FAILED'::character varying, 'SKIPPED'::character varying])::text[])))
);

CREATE TABLE public.checkin_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    concert_id uuid NOT NULL,
    staff_id uuid,
    device_id character varying(255),
    checked_at timestamp with time zone NOT NULL,
    sync_at timestamp with time zone,
    is_offline boolean DEFAULT false NOT NULL,
    gate character varying(50),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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

CREATE TABLE public.guest_list_staging (
    id bigint NOT NULL,
    batch_log_id uuid NOT NULL,
    row_number integer NOT NULL,
    concert_id uuid NOT NULL,
    normalized_phone character varying(20),
    full_name character varying(255),
    category character varying(100),
    sponsor_name character varying(255),
    notes text,
    validation_error text,
    is_active boolean DEFAULT true NOT NULL
);

CREATE SEQUENCE public.guest_list_staging_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.guest_list_staging_id_seq OWNED BY public.guest_list_staging.id;

CREATE TABLE public.guest_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    concert_id uuid NOT NULL,
    phone character varying(20) NOT NULL,
    full_name character varying(255) NOT NULL,
    category character varying(100),
    sponsor_name character varying(255),
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    batch_file character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_in_at timestamp with time zone,
    checked_in_by uuid,
    checkin_gate character varying(100)
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

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    concert_id uuid NOT NULL,
    user_id uuid NOT NULL,
    qr_code character varying(500) NOT NULL,
    qr_secret character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'VALID'::character varying NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_tickets_status CHECK (((status)::text = ANY ((ARRAY['VALID'::character varying, 'USED'::character varying, 'CANCELLED'::character varying, 'TRANSFERRED'::character varying])::text[])))
);

ALTER TABLE ONLY public.guest_list_staging ALTER COLUMN id SET DEFAULT nextval('public.guest_list_staging_id_seq'::regclass);

ALTER TABLE ONLY public.batch_logs
    ADD CONSTRAINT batch_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.checkin_logs
    ADD CONSTRAINT checkin_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.concerts
    ADD CONSTRAINT concerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_publication
    ADD CONSTRAINT event_publication_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.guest_list_staging
    ADD CONSTRAINT guest_list_staging_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.guest_lists
    ADD CONSTRAINT guest_lists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shedlock
    ADD CONSTRAINT shedlock_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_qr_code_key UNIQUE (qr_code);

ALTER TABLE ONLY public.checkin_logs
    ADD CONSTRAINT uq_checkin_logs_ticket UNIQUE (ticket_id);

ALTER TABLE ONLY public.guest_list_staging
    ADD CONSTRAINT uq_guest_list_staging_row UNIQUE (batch_log_id, row_number);

ALTER TABLE ONLY public.guest_lists
    ADD CONSTRAINT uq_guest_lists_concert_phone UNIQUE (concert_id, phone);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT uq_ticket_types_concert_name UNIQUE (concert_id, name);

CREATE INDEX idx_batch_logs_checksum ON public.batch_logs USING btree (concert_id, checksum);

CREATE INDEX idx_batch_logs_concert ON public.batch_logs USING btree (concert_id);

CREATE INDEX idx_batch_logs_job_name ON public.batch_logs USING btree (job_name);

CREATE INDEX idx_batch_logs_status ON public.batch_logs USING btree (status);

CREATE INDEX idx_checkin_logs_concert ON public.checkin_logs USING btree (concert_id);

CREATE INDEX idx_checkin_logs_concert_checked_at ON public.checkin_logs USING btree (concert_id, checked_at DESC);

CREATE INDEX idx_checkin_logs_device ON public.checkin_logs USING btree (device_id);

CREATE INDEX idx_checkin_logs_staff ON public.checkin_logs USING btree (staff_id);

CREATE INDEX idx_concerts_created_by ON public.concerts USING btree (created_by);

CREATE INDEX idx_concerts_created_by_status_event_date ON public.concerts USING btree (created_by, status, event_date);

CREATE INDEX idx_concerts_event_date ON public.concerts USING btree (event_date);

CREATE INDEX idx_concerts_status ON public.concerts USING btree (status);

CREATE INDEX idx_concerts_status_date ON public.concerts USING btree (status, event_date);

CREATE INDEX idx_event_pub_completion ON public.event_publication USING btree (completion_date);

CREATE INDEX idx_guest_list_staging_batch ON public.guest_list_staging USING btree (batch_log_id);

CREATE INDEX idx_guest_lists_concert ON public.guest_lists USING btree (concert_id);

CREATE INDEX idx_guest_lists_concert_checked_in ON public.guest_lists USING btree (concert_id, checked_in_at);

CREATE INDEX idx_guest_lists_phone ON public.guest_lists USING btree (phone);

CREATE INDEX idx_ticket_types_concert ON public.ticket_types USING btree (concert_id);

CREATE INDEX idx_tickets_concert_id ON public.tickets USING btree (concert_id);

CREATE INDEX idx_tickets_concert_status ON public.tickets USING btree (concert_id, status);

CREATE INDEX idx_tickets_qr_code ON public.tickets USING btree (qr_code);

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);

CREATE INDEX idx_tickets_ticket_type ON public.tickets USING btree (ticket_type_id);

CREATE INDEX idx_tickets_user_id ON public.tickets USING btree (user_id);

CREATE UNIQUE INDEX uq_batch_logs_active_checksum ON public.batch_logs USING btree (concert_id, checksum) WHERE ((checksum IS NOT NULL) AND ((status)::text = ANY ((ARRAY['PENDING'::character varying, 'RUNNING'::character varying, 'SUCCESS'::character varying, 'PARTIAL'::character varying])::text[])));

ALTER TABLE ONLY public.batch_logs
    ADD CONSTRAINT batch_logs_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.checkin_logs
    ADD CONSTRAINT checkin_logs_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.checkin_logs
    ADD CONSTRAINT checkin_logs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);

ALTER TABLE ONLY public.guest_list_staging
    ADD CONSTRAINT guest_list_staging_batch_log_id_fkey FOREIGN KEY (batch_log_id) REFERENCES public.batch_logs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.guest_list_staging
    ADD CONSTRAINT guest_list_staging_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.guest_lists
    ADD CONSTRAINT guest_lists_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id);


COMMENT ON TABLE concerts IS 'Read projection of Catalog configuration';
COMMENT ON TABLE ticket_types IS 'Read projection of Catalog configuration';
