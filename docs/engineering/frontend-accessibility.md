# Frontend accessibility

## Interaction and feedback

- Use native buttons, links and form controls with meaningful names, visible
  labels and appropriate text alternatives. Preserve meaningful landmarks,
  heading order and a logical tab sequence.
- Make all affected actions available by keyboard with visible focus. For a
  modal, move focus inside on open, contain it while open, support Escape when
  dismissible, and restore focus to the opener or an appropriate fallback.
- Connect validation feedback to the input. Indicate errors and state changes
  with text or semantics as well as color. Announce important async feedback
  without announcing every polling refresh.
- Respect reduced-motion preferences for optional motion. Review contrast, text
  reflow at zoom, readable labels and touch targets. For scanner flows, verify
  that staff can understand a scan result when sound or color is unavailable.

## Manual verification

Check keyboard navigation, dialog open and close, invalid submission, and
network recovery on the affected web flow. Inspect text reflow at 200% zoom
and accessible control names where applicable. For native controls, check
accessible names and focus behavior on the affected device. Record the scope
of manual checks in the review.
