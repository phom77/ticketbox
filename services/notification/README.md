# Notification service

Independent Java 21 / Spring Boot application with its own PostgreSQL database and Flyway history. It owns notifications, command inbox, delivery state/leases and retry audit. It imports no Core entities or repositories.

Run with `docker compose up -d --build` from the repository root. Standalone verification: `bash backend/mvnw -f services/notification/pom.xml verify` (use `mvnw.cmd` on Windows).

Core publishes versioned commands through RabbitMQ (`notification.commands.v1`). The consumer commits inbox deduplication and APP/EMAIL rows together before acknowledgement. Email workers claim short database leases, fetch contact/PDF data through Core's internal API and send SMTP outside transactions. Expired claims recover; failed delivery backs off and eventually becomes FAILED. Admin retry records an audit entry and cannot resend SENT rows.

SMTP is at least once: a crash after acceptance but before SENT commits can cause a duplicate. The local sink never forwards mail. Core retains reminder scheduling, contact ownership and e-ticket PDF generation.

User APIs independently verify JWT ownership/roles. Core contact/document APIs require the separate `NOTIFICATION_SERVICE_TOKEN`. Database configuration uses `NOTIFICATION_DATABASE_URL`, `NOTIFICATION_DATABASE_USER` and `NOTIFICATION_DATABASE_PASSWORD`.

See [architecture](../../docs/architecture.md), [API](../../docs/api.md) and [testing](../../docs/development.md). APP and EMAIL are implemented; SMS/Zalo schema values do not imply delivery integrations.
