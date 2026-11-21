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

## Buyer purchase flow

- Use `.buyer-page.purchase-page.page-width` and the existing scoped typography and focus rules. `.purchase-header` groups event context with the current step and its applicable deadline. Use `.purchase-step` for a useful step label and `.purchase-deadline` for the one applicable deadline.
- Use `.purchase-columns` with a primary region and an adjacent summary at desktop widths. Keep source and keyboard order usable when the page stacks. `.purchase-panel` gives a primary region or summary a readable surface.
- Use one `.purchase-action-bar` for the total and primary action. The bar docks at the bottom on narrow, tall viewports, with room for scrolling and focus. On short viewports it stays in the page flow. Announce meaningful state transitions without announcing every timer tick.

## Buyer discovery and account

- Use `PublicLayout` for buyer navigation and `AuthLayout` for sign-in, registration and recovery. Keep search and wallet access reachable on narrow screens. Use disclosure controls with visible focus and return focus after Escape.
- Keep search near the top of discovery. Use text labels for sale status and applied filters. Show the featured event once and state how many events are loaded while the list has more pages.
- Use `.buyer-page` for account typography and status feedback. Keep profile details and order history independently usable. Pair order status with a visible next action when the buyer can continue, verify payment or open tickets.

## Maintenance

- Public and customer pages use `PublicLayout`; role workspaces use `OperationsLayout`.
- Reuse existing modal, toast, image, seat-map and admin controls.
- Keep responsive layouts, keyboard focus and meaningful disabled/error/loading states.
- Format locale-sensitive currency and dates with `Intl`.
- Run frontend lint/build and review visible UI at desktop, tablet and mobile sizes.
