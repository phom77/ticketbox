# Agent delivery workflow

How AI agents (Claude Code, Codex and others) deliver work in this repository. The product owner agreed this process during the buyer UX redesign (U1–U7, November 2026). Follow it unless the product owner says otherwise for a task.

## Choose the track

| Work                                                                                | Track                                                                                                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Small fix or UI feedback (bug, layout, copy, rate-limit tweak) with no new contract | **Direct**: fix, verify, commit on `main`, push. No PR unless asked.                                     |
| Substantial behavior, a new contract, or several related changes                    | **Planned**: OpenSpec, then one PR per change into an integration branch, then one final PR into `main`. |

When unsure, ask which track the product owner wants.

## Planned track

1. **Plan.** The orchestrating agent (the one talking to the product owner) writes the plan and the OpenSpec proposals (`proposal.md`, specs, `design.md`, `tasks.md`; see [Planning changes](../development.md#planning-changes)). Put open product questions to the product owner as a short list with a recommended answer for each. Record significant decisions as ADRs in `docs/adr/`.
2. **Approve.** Implementation starts only after the product owner approves the proposals. Merge the approved proposals as their own docs PR.
3. **Integration branch.** Create `feat/<initiative>` from `main`. Each change gets its own branch and PR into it.
4. **Build.** Delegate each change to an implementation agent: a cheaper model (Sonnet), working in an isolated git worktree. Changes that don't depend on each other can be built in parallel. Give it a compact brief so it doesn't read the whole handbook:
   - the exact files, APIs and decisions;
   - the acceptance checks;
   - the commit rules below.
5. **Review.** A stronger model (Opus) reviews the **diff only** against the spec and the [review checklist](review-checklist.md). It fixes real defects on the branch, or asks the build agent to fix them.
6. **Merge.** When the review passes and GitHub CI is green, the orchestrator merges the PR into the integration branch. The product owner does not gate each step.
7. **Final PR.** Run the full browser fixture suite on the integration branch. Open the integration branch → `main` PR with the results and known gaps. **The product owner tests the UI and merges this PR, unless they ask the agent to merge it.**
8. **Close out.** After the merge, and only when the product owner confirms, archive the OpenSpec changes and delete the agent worktrees.

## Verification budget

Keep agent runs lean. Per change:

- Run `npm --prefix frontend run lint`, `npm --prefix frontend test` and `npm --prefix frontend run build`, plus at most the one browser fixture the change affects. For backend changes, run the affected service's Maven tests and boundary gate (use `scripts/mvnw-docker.sh` when the host JDK is not 21).
- Screenshots only for changed screens: **3 widths (1440, 834, 390) × light theme × English**. Never theme or language matrices.
- Don't watch CI from a build agent. The orchestrator watches it from the shell.
- CI flakes are known: Ticketing `OrderConcurrencyIntegrationTest`, the distributed recovery E2E step, and Maven downloads. Re-run a failed job once before debugging it.

## Commits and PRs

- Use a short conventional subject: `type(scope): summary`. Add a brief body only when the reason isn't obvious.
- Never add `Co-Authored-By` lines or any AI or Claude attribution to commits or PR descriptions.
- Never commit `.claude/`, `.env`, `.artifacts/`, `node_modules` symlinks, credentials or dumps.
- Don't touch the product owner's running Docker stack or their main checkout's branch without asking. Use a worktree for agent work.

## Report back

When a step finishes, tell the product owner:

- what merged, with PR links;
- which checks ran and their results;
- what was **not** verified, such as real-stack rehearsals;
- the known gaps.
