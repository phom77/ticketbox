# Frontend UI and interaction

- Use the [web design system](../../frontend/DESIGN_SYSTEM.md), implemented
  tokens and existing layouts. Reuse modal, toast, image and seat-map components
  where behavior matches. Keep variants limited to what callers need.
- Design each affected flow for pending, empty, success, validation error and
  recoverable failure as applicable. Differentiate a filtered empty list from
  unavailable data or missing permission. Give users a next action when one
  exists.
- Preserve input and focus through validation and recoverable failures. Show
  explicit confirmation when saving, uploading or completing a consequential
  action. Use confirmation or undo for destructive actions according to impact.
- Keep controls and feedback usable at narrow widths, zoom, touch and keyboard
  input. Reserve space for changing content where it prevents a control from
  moving during interaction.
- Use existing locale-aware date and currency formatting. Test realistic
  Vietnamese copy and text expansion. Follow
  [accessibility checks](frontend-accessibility.md) for the affected flow.
