# Frontend maintenance

- Read `DESIGN_SYSTEM.md` and the closest existing components before editing UI.
- Preserve the existing React, TypeScript, Vite and Tailwind setup.
- Use the implemented tokens in `src/app/app.css`; do not change the visual theme during maintenance.
- Reuse layouts, feedback components and API clients before adding alternatives.
- Preserve keyboard access, visible focus, semantic labels and loading/error/empty states.
- Keep role and ownership restrictions consistent with the backend.
- Run `npm run lint` and `npm run build` after frontend changes.
- Check desktop, tablet and mobile layouts when changing visible UI.
