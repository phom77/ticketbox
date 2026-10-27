# Frontend conventions

The implemented appearance is defined in `src/app/app.css`. Reuse existing page/layout components and tokens rather than introducing a new theme.

## Current tokens

| Token | Value |
| --- | --- |
| Canvas (`--ink`) | `#f6f7f9` |
| Surface | `#ffffff` |
| Secondary surface | `#f0f3f7` |
| Border | `#d9dee8` |
| Muted text | `#667085` |
| Primary action (`--coral`) | `#1457d9` |
| Supporting accent (`--violet`) | `#003b95` |
| Text (`--cream`) | `#182133` |

Token names are historical; their current values define the UI. Manrope is used for headings/UI, DM Sans for body text and Playfair Display Italic for editorial accents.

## Maintenance

- Public and customer pages use `PublicLayout`; role workspaces use `OperationsLayout`.
- Reuse existing modal, toast, image, seat-map and admin controls.
- Keep responsive layouts, keyboard focus and meaningful disabled/error/loading states.
- Format locale-sensitive currency and dates with `Intl`.
- Run frontend lint/build and review visible UI at desktop, tablet and mobile sizes.
