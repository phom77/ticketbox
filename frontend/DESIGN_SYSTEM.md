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

The token names are historical. The stylesheet loads Manrope, DM Sans and Playfair Display Italic. The general web styles use an Inter/system stack, and component styles may set a different face.

## Buyer tickets and notifications

- Use `.buyer-page.page-width` for both pages and `.buyer-ui` on the ticket dialog in the portal. These scopes share Manrope, 28–36 px page titles, 18–22 px section titles, 16 px body text, and 14 px labels at the default browser font size. Use the scoped sizing variables for feature styles.
- Use `.buyer-page-header` for a compact title, optional description, and relevant action. Omit decorative lead-in labels and rules. Use `.buyer-filters` with native `aria-pressed` buttons to filter one list. Let buttons wrap at narrow widths and keep primary controls at least 44 CSS px in both dimensions.
- Use existing button variants and surface and action colors. Show keyboard focus, selected filters and text labels for notification and ticket states. Keep empty, filtered-empty and failed requests distinct. Use `.buyer-state` for a compact message and its available next action.

## Maintenance

- Public and customer pages use `PublicLayout`; role workspaces use `OperationsLayout`.
- Reuse existing modal, toast, image, seat-map and admin controls.
- Keep responsive layouts, keyboard focus and meaningful disabled/error/loading states.
- Format locale-sensitive currency and dates with `Intl`.
- Run frontend lint/build and review visible UI at desktop, tablet and mobile sizes.
