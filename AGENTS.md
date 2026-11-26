# TicketBox project instructions

## Product UX feedback to preserve

- Read [the organizer and concert UX feedback](docs/product/organizer-concert-ux-feedback.md)
  before changing concert creation, ticket setup, venue maps, organizer records
  or admin workspaces. It captures direct product-owner feedback and should
  guide future agents.
- Ship production workflows that explain the task and help users complete it.
  Do not add controls solely to invoke APIs or demo states without a useful
  workflow and clear feedback.
- Concert setup must use guided, calendar-based date and time controls. Avoid
  requiring users to type raw timestamps, map coordinates or unexplained fill
  values.
- A venue image is a visual reference, not interactive inventory. Maps must
  support selecting actual zones or seats and assigning ticket types and prices,
  with assisted authoring such as templates, generated rows and seats, direct
  canvas editing and an accessible list or keyboard route.
- Admins and organizers need a clear, permission-aware route into creating and
  managing concerts. Explain access states and give an appropriate next action.
- Workspace pages should use available space beside navigation, provide readable
  type and contrast, use styled searchable controls for long option lists, and
  offer a persistent user-selectable dark theme.

## Development workflow

- Start with the [core engineering rules](docs/engineering/core.md) and select
  applicable guides from the [engineering handbook](docs/engineering/standards.md).
  For Java services, see [backend engineering](docs/engineering/backend.md).
  For web or scanner changes, see [frontend engineering](docs/engineering/frontend.md).
  Web UI work also follows [frontend/AGENTS.md](frontend/AGENTS.md).
- Agents follow the [agent delivery workflow](docs/engineering/agent-workflow.md):
  direct commits on `main` for small fixes, and for larger work OpenSpec,
  then one reviewed PR per change into an integration branch, then a final PR
  into `main` that the product owner tests.
- Use the checks in [Development and testing](docs/development.md). For review,
  apply the [engineering checklist](docs/engineering/review-checklist.md).
- For new substantial behavior or contract changes, use the
  [OpenSpec workflow](docs/development.md#planning-changes). Get the proposal,
  requirements, design and tasks reviewed before implementation. For small
  fixes and documentation updates, inspect the scope, make the change, and
  verify it with the relevant checks.
- Keep existing specifications and accepted decisions as references. Continue
  work already planned under `docs/superpowers/` in its existing artifacts.
  Get approval before changing an engineering policy or making a significant
  architecture, data ownership, security, or infrastructure decision.

## Java services and domain modeling

Java service architecture, domain modeling and refactoring rules live in
[services/AGENTS.md](services/AGENTS.md). Read it before changing code in
`services/`.
