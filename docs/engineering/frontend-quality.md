# Frontend quality checks

- Verify the changed user journey in its allowed role and check denied actions
  when access rules change. Include loading, empty, error and recovery states
  as applicable. Exercise navigation, refresh and a slow or stale response if
  they can alter the outcome.
- For web changes, run `npm run lint` and `npm run build` in `frontend/`.
  Check visible changes at desktop, tablet and mobile sizes. Apply the
  [accessibility checks](frontend-accessibility.md) on changed interactions.
- For checkout changes, use the documented
  [Chromium recovery checks](../development.md#distributed-and-browser-regression)
  for lost responses, reloads, failures and late settlement as applicable.
  Use service integration checks for changes to real checkout contracts.
- For scanner changes, run `npm run typecheck` in `mobile-scanner/`. Use a
  representative device for camera or native storage changes. Check offline,
  reconnect, duplicate scan and conflict outcomes when sync changes.
- Report the flows, devices or viewports actually checked and the commands and
  results. Add a focused regression for a changed behavior or a reproduced
  defect where an existing suite can cover it.
