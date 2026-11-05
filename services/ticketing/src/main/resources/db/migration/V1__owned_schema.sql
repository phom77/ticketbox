

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

CREATE TABLE public.order_events (
    order_id uuid NOT NULL,
    stream_version bigint NOT NULL,
    event_type text NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT order_events_check CHECK ((((stream_version = 1) AND (event_type = ANY (ARRAY['OrderCreated'::text, 'OrderImported'::text]))) OR ((stream_version > 1) AND (event_type = ANY (ARRAY['OrderPaymentInitiated'::text, 'OrderPaid'::text, 'OrderExpired'::text, 'OrderCancelled'::text]))))),
    CONSTRAINT order_events_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT order_events_schema_version_check CHECK ((schema_version = 1)),
    CONSTRAINT order_events_stream_version_check CHECK ((stream_version > 0))
);

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,0) NOT NULL,
    subtotal numeric(12,0) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_order_items_quantity_positive CHECK ((quantity > 0)),
    CONSTRAINT chk_order_items_subtotal_non_negative CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT chk_order_items_unit_price_non_negative CHECK ((unit_price >= (0)::numeric))
);

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    concert_id uuid NOT NULL,
    status character varying(20) DEFAULT 'AWAITING_PAYMENT'::character varying NOT NULL,
    total_amount numeric(12,0) NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    payment_provider character varying(20),
    payment_ref character varying(255),
    payment_url text,
    paid_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_orders_payment_provider CHECK (((payment_provider IS NULL) OR ((payment_provider)::text = ANY ((ARRAY['VNPAY'::character varying, 'MOMO'::character varying, 'MOCK'::character varying])::text[])))),
    CONSTRAINT chk_orders_status CHECK (((status)::text = ANY ((ARRAY['AWAITING_PAYMENT'::character varying, 'PAID'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying, 'REFUNDED'::character varying, 'PAYMENT_FAILED'::character varying])::text[]))),
    CONSTRAINT chk_orders_total_amount_non_negative CHECK ((total_amount >= (0)::numeric))
);

CREATE TABLE public.payment_cutover_control (
    id integer NOT NULL,
    mode character varying(20) NOT NULL,
    CONSTRAINT payment_cutover_control_id_check CHECK ((id = 1))
);

CREATE TABLE public.purchase_guards (
    user_id uuid NOT NULL,
    concert_id uuid NOT NULL
);

CREATE TABLE public.remote_reminder_dispatches (
    event_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.shedlock (
    name character varying(64) NOT NULL,
    lock_until timestamp with time zone NOT NULL,
    locked_at timestamp with time zone NOT NULL,
    locked_by character varying(255) NOT NULL
);

CREATE TABLE public.ticket_holds (
    id uuid NOT NULL,
    concert_id uuid NOT NULL,
    user_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    quantity integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    session_token character varying(255),
    CONSTRAINT ticket_hold_quantity_positive CHECK ((quantity > 0))
);

CREATE TABLE public.ticket_inventory (
    ticket_type_id uuid NOT NULL,
    total_quantity integer NOT NULL,
    available_qty integer NOT NULL,
    active boolean NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_inventory_check CHECK (((available_qty >= 0) AND (available_qty <= total_quantity))),
    CONSTRAINT ticket_inventory_total_quantity_check CHECK ((total_quantity > 0))
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

CREATE TABLE public.ticketing_payment_inbox (
    event_id uuid NOT NULL,
    intent_id uuid NOT NULL,
    decision character varying(20) NOT NULL,
    reason text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ticketing_payment_intents (
    order_id uuid NOT NULL,
    intent_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(20) NOT NULL,
    amount numeric(12,0) NOT NULL,
    currency character varying(3) NOT NULL,
    order_version bigint DEFAULT 1 NOT NULL,
    request_id character varying(100) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    state character varying(30) DEFAULT 'CREATED'::character varying NOT NULL,
    attempt_id uuid,
    payment_url text,
    provider_ref text,
    transaction_id text,
    lease_owner uuid,
    lease_until timestamp with time zone,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticketing_payment_intents_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT ticketing_payment_intents_currency_check CHECK (((currency)::text = 'VND'::text)),
    CONSTRAINT ticketing_payment_intents_order_version_check CHECK ((order_version = 1)),
    CONSTRAINT ticketing_payment_intents_provider_check CHECK (((provider)::text = ANY ((ARRAY['MOCK'::character varying, 'MOMO'::character varying, 'VNPAY'::character varying])::text[])))
);

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

ALTER TABLE ONLY public.concerts
    ADD CONSTRAINT concerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.event_publication
    ADD CONSTRAINT event_publication_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_events
    ADD CONSTRAINT order_events_pkey PRIMARY KEY (order_id, stream_version);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_cutover_control
    ADD CONSTRAINT payment_cutover_control_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.purchase_guards
    ADD CONSTRAINT purchase_guards_pkey PRIMARY KEY (user_id, concert_id);

ALTER TABLE ONLY public.remote_reminder_dispatches
    ADD CONSTRAINT remote_reminder_dispatches_pkey PRIMARY KEY (event_id);

ALTER TABLE ONLY public.shedlock
    ADD CONSTRAINT shedlock_pkey PRIMARY KEY (name);

ALTER TABLE ONLY public.ticket_holds
    ADD CONSTRAINT ticket_holds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_inventory
    ADD CONSTRAINT ticket_inventory_pkey PRIMARY KEY (ticket_type_id);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticketing_payment_inbox
    ADD CONSTRAINT ticketing_payment_inbox_pkey PRIMARY KEY (event_id);

ALTER TABLE ONLY public.ticketing_payment_intents
    ADD CONSTRAINT ticketing_payment_intents_intent_id_key UNIQUE (intent_id);

ALTER TABLE ONLY public.ticketing_payment_intents
    ADD CONSTRAINT ticketing_payment_intents_pkey PRIMARY KEY (order_id);

ALTER TABLE ONLY public.ticketing_payment_intents
    ADD CONSTRAINT ticketing_payment_intents_request_id_key UNIQUE (request_id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_qr_code_key UNIQUE (qr_code);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT uq_order_items_order_ticket_type UNIQUE (order_id, ticket_type_id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT uq_orders_user_idempotency UNIQUE (user_id, idempotency_key);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT uq_ticket_types_concert_name UNIQUE (concert_id, name);

ALTER TABLE ONLY public.ticket_holds
    ADD CONSTRAINT uq_user_concert_ticket_type UNIQUE (user_id, concert_id, ticket_type_id);

CREATE INDEX idx_concerts_created_by ON public.concerts USING btree (created_by);

CREATE INDEX idx_concerts_created_by_status_event_date ON public.concerts USING btree (created_by, status, event_date);

CREATE INDEX idx_concerts_event_date ON public.concerts USING btree (event_date);

CREATE INDEX idx_concerts_status ON public.concerts USING btree (status);

CREATE INDEX idx_concerts_status_date ON public.concerts USING btree (status, event_date);

CREATE INDEX idx_event_pub_completion ON public.event_publication USING btree (completion_date);

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX idx_order_items_order_type ON public.order_items USING btree (order_id, ticket_type_id);

CREATE INDEX idx_order_items_type ON public.order_items USING btree (ticket_type_id);

CREATE INDEX idx_orders_concert_id ON public.orders USING btree (concert_id);

CREATE INDEX idx_orders_concert_status ON public.orders USING btree (concert_id, status);

CREATE INDEX idx_orders_concert_status_paid_at ON public.orders USING btree (concert_id, status, paid_at);

CREATE INDEX idx_orders_expires ON public.orders USING btree (expires_at) WHERE ((status)::text = 'AWAITING_PAYMENT'::text);

CREATE INDEX idx_orders_status ON public.orders USING btree (status);

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);

CREATE INDEX idx_orders_user_status ON public.orders USING btree (user_id, status);

CREATE INDEX idx_ticket_types_concert ON public.ticket_types USING btree (concert_id);

CREATE INDEX idx_tickets_concert_id ON public.tickets USING btree (concert_id);

CREATE INDEX idx_tickets_concert_status ON public.tickets USING btree (concert_id, status);

CREATE INDEX idx_tickets_qr_code ON public.tickets USING btree (qr_code);

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);

CREATE INDEX idx_tickets_ticket_type ON public.tickets USING btree (ticket_type_id);

CREATE INDEX idx_tickets_user_id ON public.tickets USING btree (user_id);

CREATE INDEX order_item_ticket_order_idx ON public.order_items USING btree (ticket_type_id, order_id);

CREATE INDEX order_user_status_idx ON public.orders USING btree (user_id, status);

CREATE INDEX ticket_hold_expiry_idx ON public.ticket_holds USING btree (expires_at, user_id, concert_id);

CREATE UNIQUE INDEX ticketing_provider_transaction ON public.ticketing_payment_intents USING btree (provider, transaction_id) WHERE (transaction_id IS NOT NULL);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.purchase_guards
    ADD CONSTRAINT purchase_guards_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.ticket_inventory
    ADD CONSTRAINT ticket_inventory_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ticketing_payment_intents
    ADD CONSTRAINT ticketing_payment_intents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_concert_id_fkey FOREIGN KEY (concert_id) REFERENCES public.concerts(id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id);


CREATE FUNCTION order_projection_snapshot(target_order UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT to_jsonb(o) || jsonb_build_object('items', COALESCE(
        (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id)
         FROM order_items i WHERE i.order_id = o.id), '[]'::jsonb))
    FROM orders o WHERE o.id = target_order
$$;

CREATE FUNCTION replay_order(target_order UUID) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT jsonb_object_agg(key, value)
    FROM (
        SELECT DISTINCT ON (field.key) field.key, field.value
        FROM order_events e
        CROSS JOIN LATERAL jsonb_each(e.payload) field
        WHERE e.order_id = target_order
        ORDER BY field.key, e.stream_version DESC
    ) latest
$$;

COMMENT ON TABLE concerts IS 'Read projection of Catalog configuration';
COMMENT ON TABLE ticket_types IS 'Read projection of Catalog configuration';
