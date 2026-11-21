# Organizer and concert UX feedback

This note records product-owner feedback from the TicketBox concert redesign
conversation on 21 November 2026. Read it before changing organizer, admin,
concert creation, ticket inventory, maps or operational pages. Treat it as
product direction, then check the current implementation and permissions before
proposing a change.

## What the product owner reported

- The organizer could not tell where or how to create a concert. An admin view
  appeared to offer management only, while the organizer workspace showed an
  access-required screen. The create and manage paths, roles and permission
  requirements need to be understandable in the product.
- The earlier performance-creation and map editor felt like a demo assembled
  around API calls. Terms such as “fill” had no clear meaning, and drawing by
  entering x/y coordinates was not a reasonable workflow for event organizers.
- Uploading a seating image did not let the organizer select seats, define which
  ticket type each seat belonged to, or interact with the seating plan. A visual
  background alone does not configure inventory.
- Manually typing concert date and time was poor UX. Scheduling needs familiar
  calendar and time controls, with venue timezone and useful validation.
- Native dropdowns, small faint text, cramped content cards, and unused space
  outside the sidebar made administration harder to read and operate. The owner
  also asked for a switchable dark theme.
- The organizer needs to handle a broad range of events, from general admission
  and standing areas to zoned and individually numbered seating, for small and
  large venues. Maps vary by event and need customization without requiring
  specialist drawing software.

## Product direction

- Start concert setup from the organizer's real task. Make event information,
  venue and schedule, ticketing and map, and review/publication clear steps with
  saved progress and specific validation messages.
- Use date, time and timezone controls that prevent invalid or ambiguous times.
  Keep dates localized and show the selected venue timezone.
- Offer venue templates and reusable maps, image or SVG import as a starting
  point, and canvas operations that reduce repetitive work. Include useful map
  object selection, row or seat generation, naming defaults, labels, undo, zoom
  and a clear properties panel for the selected area or seat.
- Let organizers select a real zone or seat and assign ticket type, price and
  availability. Keep the buyer map interactive, and provide an equivalent
  accessible list or keyboard path.
- Support GA quantities, standing zones, unnumbered reserved zones, individually
  numbered seats and mixed configurations. Each performance must have the
  appropriate schedule, map, inventory and ticket assignment.
- Make role access explicit. Admin operations and organizer ownership have
  different scopes. An access state should name the required permission and
  offer the allowed next action.
- Design admin and organizer pages for lookup and work. Use the space beside the
  sidebar, readable type and contrast, clear search and filters, and a persistent
  light/dark appearance choice.
- Do not equate a rendered control with a usable feature. Verify the full task
  through the normal user route, including saved data and visible outcomes.

## Review questions for future agents

1. Can a first-time organizer tell what the next step does and what information
   is needed?
2. Can they finish without typing coordinates, opaque values or raw timestamps?
3. Does selecting a seat or zone affect inventory and ticket assignment in the
   saved performance and buyer journey?
4. Are loading, empty, invalid, access-denied and success states understandable?
5. Have the actual desktop and mobile layouts, keyboard interaction, and light
   and dark appearances been inspected?
6. Is this a complete organizer workflow, or only a control connected to an API?
