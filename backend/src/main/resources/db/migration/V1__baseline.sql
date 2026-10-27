CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
                       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                       email VARCHAR(255) NOT NULL UNIQUE,
                       phone VARCHAR(20),
                       full_name VARCHAR(255) NOT NULL,
                       password_hash VARCHAR(255) NOT NULL,
                       role VARCHAR(20) NOT NULL DEFAULT 'AUDIENCE',
                       is_active BOOLEAN NOT NULL DEFAULT TRUE,
                       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                       CONSTRAINT chk_users_role
                           CHECK (role IN ('AUDIENCE', 'ORGANIZER', 'STAFF', 'ADMIN'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE concerts (
                          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                          title VARCHAR(500) NOT NULL,
                          description TEXT,
                          artist_bio TEXT,
                          venue_name VARCHAR(500) NOT NULL,
                          venue_address TEXT NOT NULL,
                          event_date TIMESTAMPTZ NOT NULL,
                          doors_open_at TIMESTAMPTZ,
                          sale_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                          sale_end_at TIMESTAMPTZ,
                          status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
                          seat_map_svg TEXT,
                          poster_url VARCHAR(500),
                          created_by UUID NOT NULL REFERENCES users(id),
                          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                          CONSTRAINT chk_concerts_status
                              CHECK (status IN ('DRAFT', 'ON_SALE', 'SOLD_OUT', 'CANCELLED', 'COMPLETED'))
);

CREATE INDEX idx_concerts_status ON concerts(status);
CREATE INDEX idx_concerts_event_date ON concerts(event_date);
CREATE INDEX idx_concerts_created_by ON concerts(created_by);
CREATE INDEX idx_concerts_status_date ON concerts(status, event_date);

CREATE TABLE ticket_types (
                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE RESTRICT,
                              name VARCHAR(100) NOT NULL,
                              price NUMERIC(12, 0) NOT NULL,
                              total_quantity INTEGER NOT NULL,
                              available_qty INTEGER NOT NULL,
                              max_per_account INTEGER NOT NULL DEFAULT 4,
                              sale_start_at TIMESTAMPTZ NOT NULL,
                              sale_end_at TIMESTAMPTZ,
                              zone_color VARCHAR(7),
                              is_active BOOLEAN NOT NULL DEFAULT TRUE,
                              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                              CONSTRAINT chk_ticket_types_total_quantity_positive
                                  CHECK (total_quantity > 0),
                              CONSTRAINT chk_ticket_types_available_qty_non_negative
                                  CHECK (available_qty >= 0),
                              CONSTRAINT chk_ticket_types_available_lte_total
                                  CHECK (available_qty <= total_quantity),
                              CONSTRAINT chk_ticket_types_price_non_negative
                                  CHECK (price >= 0),
                              CONSTRAINT chk_ticket_types_max_per_account_positive
                                  CHECK (max_per_account > 0),
                              CONSTRAINT uq_ticket_types_concert_name
                                  UNIQUE (concert_id, name)
);

CREATE INDEX idx_ticket_types_concert ON ticket_types(concert_id);
CREATE INDEX idx_ticket_types_sale_window ON ticket_types(sale_start_at, sale_end_at);

CREATE TABLE orders (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID NOT NULL REFERENCES users(id),
                        concert_id UUID NOT NULL REFERENCES concerts(id),
                        status VARCHAR(20) NOT NULL DEFAULT 'AWAITING_PAYMENT',
                        total_amount NUMERIC(12, 0) NOT NULL,
                        idempotency_key VARCHAR(255) UNIQUE,
                        payment_provider VARCHAR(20),
                        payment_ref VARCHAR(255),
                        payment_url TEXT,
                        paid_at TIMESTAMPTZ,
                        expires_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                        CONSTRAINT chk_orders_status
                            CHECK (status IN (
                                              'AWAITING_PAYMENT',
                                              'PAID',
                                              'EXPIRED',
                                              'CANCELLED',
                                              'REFUNDED',
                                              'PAYMENT_FAILED'
                                )),
                        CONSTRAINT chk_orders_total_amount_non_negative
                            CHECK (total_amount >= 0),
                        CONSTRAINT chk_orders_payment_provider
                            CHECK (payment_provider IS NULL OR payment_provider IN ('VNPAY', 'MOMO', 'MOCK'))
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_concert_id ON orders(concert_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_idempotency ON orders(idempotency_key);
CREATE INDEX idx_orders_concert_status ON orders(concert_id, status);
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
CREATE INDEX idx_orders_expires
    ON orders(expires_at)
    WHERE status = 'AWAITING_PAYMENT';

CREATE TABLE order_items (
                             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                             order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                             ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
                             quantity INTEGER NOT NULL,
                             unit_price NUMERIC(12, 0) NOT NULL,
                             subtotal NUMERIC(12, 0) NOT NULL,
                             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                             updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                             CONSTRAINT chk_order_items_quantity_positive
                                 CHECK (quantity > 0),
                             CONSTRAINT chk_order_items_unit_price_non_negative
                                 CHECK (unit_price >= 0),
                             CONSTRAINT chk_order_items_subtotal_non_negative
                                 CHECK (subtotal >= 0),
                             CONSTRAINT uq_order_items_order_ticket_type
                                 UNIQUE (order_id, ticket_type_id)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_type ON order_items(ticket_type_id);
CREATE INDEX idx_order_items_order_type ON order_items(order_id, ticket_type_id);

CREATE TABLE tickets (
                         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                         order_item_id UUID NOT NULL REFERENCES order_items(id),
                         ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
                         concert_id UUID NOT NULL REFERENCES concerts(id),
                         user_id UUID NOT NULL REFERENCES users(id),
                         qr_code VARCHAR(500) NOT NULL UNIQUE,
                         qr_secret VARCHAR(255) NOT NULL,
                         status VARCHAR(20) NOT NULL DEFAULT 'VALID',
                         issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                         used_at TIMESTAMPTZ,
                         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                         CONSTRAINT chk_tickets_status
                             CHECK (status IN ('VALID', 'USED', 'CANCELLED', 'TRANSFERRED'))
);

CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_tickets_concert_id ON tickets(concert_id);
CREATE INDEX idx_tickets_qr_code ON tickets(qr_code);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_ticket_type ON tickets(ticket_type_id);

CREATE TABLE checkin_logs (
                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              ticket_id UUID NOT NULL REFERENCES tickets(id),
                              concert_id UUID NOT NULL REFERENCES concerts(id),
                              staff_id UUID REFERENCES users(id),
                              device_id VARCHAR(255),
                              checked_at TIMESTAMPTZ NOT NULL,
                              sync_at TIMESTAMPTZ,
                              is_offline BOOLEAN NOT NULL DEFAULT FALSE,
                              gate VARCHAR(50),
                              notes TEXT,
                              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                              CONSTRAINT uq_checkin_logs_ticket UNIQUE (ticket_id)
);

CREATE INDEX idx_checkin_logs_concert ON checkin_logs(concert_id);
CREATE INDEX idx_checkin_logs_staff ON checkin_logs(staff_id);
CREATE INDEX idx_checkin_logs_device ON checkin_logs(device_id);

CREATE TABLE payment_logs (
                              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              order_id UUID NOT NULL REFERENCES orders(id),
                              provider VARCHAR(20) NOT NULL,
                              event_type VARCHAR(50) NOT NULL,
                              provider_ref VARCHAR(255),
                              raw_payload JSONB,
                              amount NUMERIC(12, 0),
                              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                              CONSTRAINT chk_payment_logs_provider
                                  CHECK (provider IN ('VNPAY', 'MOMO', 'MOCK')),
                              CONSTRAINT chk_payment_logs_event_type
                                  CHECK (event_type IN (
                                                        'INITIATED',
                                                        'WEBHOOK_RECEIVED',
                                                        'SUCCESS',
                                                        'FAILED',
                                                        'TIMEOUT',
                                                        'REFUNDED'
                                      )),
                              CONSTRAINT chk_payment_logs_amount_non_negative
                                  CHECK (amount IS NULL OR amount >= 0)
);

CREATE INDEX idx_payment_logs_order ON payment_logs(order_id);
CREATE INDEX idx_payment_logs_provider_ref ON payment_logs(provider, provider_ref);
CREATE INDEX idx_payment_logs_event_type ON payment_logs(event_type);

CREATE TABLE guest_lists (
                             id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                             concert_id UUID NOT NULL REFERENCES concerts(id),
                             phone VARCHAR(20) NOT NULL,
                             full_name VARCHAR(255) NOT NULL,
                             category VARCHAR(100),
                             sponsor_name VARCHAR(255),
                             notes TEXT,
                             is_active BOOLEAN NOT NULL DEFAULT TRUE,
                             imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                             batch_file VARCHAR(255),
                             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                             updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                             CONSTRAINT uq_guest_lists_concert_phone UNIQUE (concert_id, phone)
);

CREATE INDEX idx_guest_lists_concert ON guest_lists(concert_id);
CREATE INDEX idx_guest_lists_phone ON guest_lists(phone);

CREATE TABLE batch_logs (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            job_name VARCHAR(100) NOT NULL,
                            file_name VARCHAR(255),
                            started_at TIMESTAMPTZ NOT NULL,
                            completed_at TIMESTAMPTZ,
                            status VARCHAR(20) NOT NULL,
                            total_rows INTEGER NOT NULL DEFAULT 0,
                            success_rows INTEGER NOT NULL DEFAULT 0,
                            error_rows INTEGER NOT NULL DEFAULT 0,
                            error_detail TEXT,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                            CONSTRAINT chk_batch_logs_status
                                CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
                            CONSTRAINT chk_batch_logs_row_counts_non_negative
                                CHECK (total_rows >= 0 AND success_rows >= 0 AND error_rows >= 0)
);

CREATE INDEX idx_batch_logs_job_name ON batch_logs(job_name);
CREATE INDEX idx_batch_logs_status ON batch_logs(status);

CREATE TABLE notifications (
                               id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                               user_id UUID REFERENCES users(id),
                               channel VARCHAR(20) NOT NULL,
                               event_type VARCHAR(50) NOT NULL,
                               subject VARCHAR(500),
                               body TEXT NOT NULL,
                               status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                               sent_at TIMESTAMPTZ,
                               attempts INTEGER NOT NULL DEFAULT 0,
                               last_error TEXT,
                               created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                               updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                               CONSTRAINT chk_notifications_channel
                                   CHECK (channel IN ('EMAIL', 'ZALO', 'SMS', 'APP')),
                               CONSTRAINT chk_notifications_status
                                   CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
                               CONSTRAINT chk_notifications_attempts_non_negative
                                   CHECK (attempts >= 0)
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status_pending
    ON notifications(status)
    WHERE status = 'PENDING';
CREATE INDEX idx_notifications_event_type ON notifications(event_type);

CREATE TABLE artist_pdf_jobs (
                                 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                 concert_id UUID NOT NULL REFERENCES concerts(id),
                                 file_url VARCHAR(500) NOT NULL,
                                 status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                                 result_bio TEXT,
                                 started_at TIMESTAMPTZ,
                                 completed_at TIMESTAMPTZ,
                                 error_message TEXT,
                                 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                                 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                                 CONSTRAINT chk_artist_pdf_jobs_status
                                     CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED'))
);

CREATE INDEX idx_artist_pdf_jobs_concert ON artist_pdf_jobs(concert_id);
CREATE INDEX idx_artist_pdf_jobs_status ON artist_pdf_jobs(status);
