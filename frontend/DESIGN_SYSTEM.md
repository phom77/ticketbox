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

## Operations workspace

The Admin and Organizer workspaces use the available width beside the sidebar. Keep filters close to the records they control. Place contextual actions beside their record and let wider screens show the directory and editor together. Allow tables to scroll within their own region at narrow widths.

The workspace follows the browser color preference on first use and remembers an explicit light or dark choice on the device. Use the scoped palette in `src/app/operations.css` for surfaces, text and borders. Use its semantic tokens for selection, focus and status. Workspace text uses a 16px base with 15px table cells and controls. Verify contrast and visible focus in both themes.

Use `WorkspaceSelect` for finite options in the workspace and `ConcertPicker` for concert search. Keep date and time fields on their native controls.
