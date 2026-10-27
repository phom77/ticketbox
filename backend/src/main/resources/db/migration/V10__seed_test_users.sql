INSERT INTO users (id, email, phone, full_name, password_hash, role, is_active, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000010', 'admin@ticketbox.vn', '0123456789', 'Test Admin', '$2a$10$Jq3HmuxZRFzkG5jlPyIr3eq86cSyIsE9isHdSLWc9X95ztLI6w7aG', 'ADMIN', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000011', 'organizer@ticketbox.vn', '0123456789', 'Test Organizer', '$2a$10$Jq3HmuxZRFzkG5jlPyIr3eq86cSyIsE9isHdSLWc9X95ztLI6w7aG', 'ORGANIZER', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000012', 'staff@ticketbox.vn', '0123456789', 'Test Staff', '$2a$10$Jq3HmuxZRFzkG5jlPyIr3eq86cSyIsE9isHdSLWc9X95ztLI6w7aG', 'STAFF', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000013', 'audience@ticketbox.vn', '0123456789', 'Test Audience', '$2a$10$Jq3HmuxZRFzkG5jlPyIr3eq86cSyIsE9isHdSLWc9X95ztLI6w7aG', 'AUDIENCE', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
