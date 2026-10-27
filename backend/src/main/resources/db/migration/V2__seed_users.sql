INSERT INTO users (id, email, phone, full_name, password_hash, role, is_active, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'organizer@ticketbox.com', '0123456789', 'Mock Organizer', '$2a$10$dummyhash', 'ORGANIZER', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000002', 'admin@ticketbox.com', '0123456789', 'Mock Admin', '$2a$10$dummyhash', 'ADMIN', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000003', 'audience@ticketbox.com', '0123456789', 'Mock Audience', '$2a$10$dummyhash', 'AUDIENCE', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
