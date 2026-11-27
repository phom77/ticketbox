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

- Use `PublicLayout` for buyer navigation and `AuthLayout` for sign-in, registration and recovery. Use the same header gutter and search across public pages. Keep search and wallet access reachable on narrow screens. Show language and the theme toggle in the header from 761 CSS px; below that, place them in the account disclosure with notifications. Return focus after Escape.
- Use the homepage for featured and upcoming events. Use `/events` for the searchable catalogue. Show the featured event once, use text labels for sale status and applied filters, and use the total from Catalog for paginated results.
- Use `.buyer-page` for account typography and status feedback. Keep profile details and order history independently usable. Pair order status with a visible next action when the buyer can continue, verify payment or open tickets.

## Buyer shell and shared building blocks

- **Header search.** `HeaderSearch` has three parts: Where (city or venue), When (date presets or a calendar range in a disclosure) and What (the `Find events` combobox). Where and What join into `q`; When writes `date`, `from` and `to`. Suggestions use the ARIA combobox pattern with grouped options (recent searches, events, venues); Escape closes the list before it closes the mobile panel. Do not add filters to the header that Catalog does not apply.
- **Browse row.** `.public-browse` links to catalogue views Catalog supports. Mark the current view with `aria-current="page"`. It scrolls horizontally on narrow screens.
- **Theme.** `useThemePreference` holds the device-wide light/dark choice for both layouts; `PublicLayout` sets `data-theme` on `<html>` so portals follow it. Buyer dark tokens live in `src/app/buyer-theme.css`. Use tokens (`--surface`, `--surface-2`, `--line`, `--muted`, `--cream`, `--violet`, `--coral`, `--buyer-selected-bg`, `--buyer-warning-*`, `--buyer-danger-*`, `--buyer-success-text`) instead of hex values in new buyer styles. When an older rule hard-codes a light colour, add a scoped `:root[data-theme='dark']` override there.
- **Purchase progress.** Put `PurchaseProgress` at the top of each purchase step's `.purchase-header` (Choose date → Tickets → Checkout → Done). It renders the `.purchase-step` label "Step n of 4" and marks the current step with `aria-current="step"`. Status pages pass `step` to `CheckoutStatusPanel`.
- **Hold timer.** Use `HoldTimer` for the one deadline of a step. It formats `h:mm:ss` from one hour, keeps the `role="timer"` silent and announces the warning (2 minutes by default) and expiry once through its status message. Pass `expiredMessage=""` when the page already announces expiry with its own alert and next action.
- **All-in price.** TicketBox charges no service fees. Format amounts with `formatPrice`, show the lowest price as `PriceFrom` ("From ₫X"), and place `AllInPriceNote` ("Price includes all fees") next to totals. Do not add a fee breakdown.
- **Loading and states.** Use `CardGridSkeleton`, `DetailSkeleton` or `PanelSkeleton` for first loads; each has one status label and stops animating with reduced motion. Use `BuyerState` (`tone` = `loading`, `empty`, `error`) for messages with an optional next action; errors are alerts.
- **Event data.** Use `EventView` (`features/event/eventView.ts`) for event context in buyer pages, `purchasePaths` for detail, waiting-room and selection routes, and `loadConcertView` when a legacy order or ticket needs Catalog details. Performance orders and tickets carry their own date and venue.
- **Order outcome.** Decide what a buyer can do with an order through `resolveOrderOutcome` and poll with `pollOrderOutcome`. Map outcomes to page screens in the page; keep the copy in `customer:orderOutcome_*`.
- **Not found.** Unknown URLs render `NotFoundPage` inside `PublicLayout`; keep the address and offer the role home and the catalogue.

## Maintenance

- Public and customer pages use `PublicLayout`; role workspaces use `OperationsLayout`.
- Reuse existing modal, toast, image, seat-map and admin controls.
- Keep responsive layouts, keyboard focus and meaningful disabled/error/loading states.
- Format locale-sensitive currency and dates with `Intl`.
- Run frontend lint/build and review visible UI at desktop, tablet and mobile sizes.

## Operations workspace

The Admin and Organizer workspaces use the available width beside the sidebar. Keep filters close to the records they control. Place contextual actions beside their record and let wider screens show the directory and editor together. Allow tables to scroll within their own region at narrow widths.

The workspace follows the browser color preference on first use and remembers an explicit light or dark choice on the device. Use the scoped palette in `src/app/operations.css` for surfaces, text and borders. Use its semantic tokens for selection, focus and status. Workspace text uses a 16px base with 15px table cells and controls. Verify contrast and visible focus in both themes.

Use `WorkspaceSelect` for finite options in the workspace and `ConcertPicker` for concert search. Keep date and time fields on their native controls.

## Ticket setup terminology and inputs

- Organizers see an offer as a **Ticket type** (Loại vé) and an inventory group as a **Stock pool** (Nhóm chỗ), or **Seat pool** (Nhóm ghế) for numbered seats. API, storage and code keep `offer` and `group`; do not show those words in the UI.
- Every price an organizer or admin types uses `MoneyInput` (whole VND, thousands separators, ₫ unit). A test fails if a raw `type="number"` price input appears under `pages/organizer` or `pages/admin`. Format prices shown in summaries with the shared VND formatter.
- Sale windows are chosen with the presets in `features/performance/saleWindowPresets.ts` (Whole sale period, Early bird, Final days, Starts later, Custom). Presets compute times in the venue timezone, stay inside the performance sale window and show a one-line summary.
- A map without a layout starts from the guided picker (saved templates, starter layouts, General admission without a map, Blank canvas). Each import has a sample file and a "File format" disclosure; errors name the line and column.
