

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    full_name character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'AUDIENCE'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_users_role CHECK (((role)::text = ANY ((ARRAY['AUDIENCE'::character varying, 'ORGANIZER'::character varying, 'STAFF'::character varying, 'ADMIN'::character varying])::text[])))
);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE INDEX idx_users_email ON public.users USING btree (email);

CREATE INDEX idx_users_role ON public.users USING btree (role);

