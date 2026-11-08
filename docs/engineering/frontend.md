# Frontend engineering

The web app uses React, TypeScript, Vite and Tailwind. The staff scanner uses
Expo and React Native. Start with the applicable app conventions and select
the topic guides below.

- Web changes follow [frontend/AGENTS.md](../../frontend/AGENTS.md) and the
  [design system](../../frontend/DESIGN_SYSTEM.md).
- Scanner changes follow the [scanner guide](../../mobile-scanner/README.md).
  Native builds persist datasets and pending logs in SQLite. The browser
  variant uses in-memory storage. Include the relevant platform in verification.

| Change | Read |
| --- | --- |
| Routes, features, components or shared code | [Architecture](frontend-architecture.md) |
| Requests, forms, auth state, checkout, queue or offline sync | [State and data](frontend-state-and-data.md) |
| Layout, interaction, feedback or copy | [UI and design system](frontend-ui.md), [Accessibility](frontend-accessibility.md) |
| Credentials, permissions, uploads or rendered markup | [Frontend security](frontend-security.md) |
| Loading, rendering, subscriptions or network costs | [Performance](frontend-performance.md) |
| Acceptance and review | [Frontend quality](frontend-quality.md) |
