# Factory project rules

What the factory's Builder, Verifier and Reviewer need to know about **this** repository. The
generic protocol is in `conductorfactory/prompts/`; this file is the only repository-specific part.
Keep it short and link to the repository's own docs instead of repeating them. Replace every
`TODO`; delete a section's examples once it is filled in.

## Read first

TODO: the files every session must read before working, e.g. `CLAUDE.md`, `AGENTS.md`,
`CONTRIBUTING.md`, and how to find the guide next to the code being changed.

## Checks (Builder, before every push)

TODO: the exact commands that must pass, and where to run them. For example:

```sh
npm run lint && npm run typecheck && npm test
```

## Acceptance tests

TODO: how an acceptance criterion is proven here.

- Where the tests live and which framework they use.
- The command that runs named tests, e.g. `npx playwright test <spec files>`.
- How to start and stop what the tests need (app, database, services), and what must **never**
  be started, stopped or touched (shared or production services).
- What evidence a run leaves behind (reports, videos, screenshots, logs) and where.

## Plan first (tripwires)

Exploring comes first and building directly is the default: bug fixes and small or medium
features never stop for a plan. The Builder writes a plan and waits for the human only when, after
exploring, the change itself (not merely the area it touches) needs a decision this repository's
rules reserve for the owner. Keep this list to those rules; anything else is an assumption the
Builder records in the PR.

TODO: this repository's list, e.g. schema change or migration · auth or permission change · new
dependency or vendor · new screen · anything the repository's rules say needs the owner's decision.

Plans go in: TODO (e.g. `docs/plans/<issue>-<slug>.md`), following: TODO (an existing plan to copy the shape of).

## Blocking review findings

On top of the generic ones in the Reviewer prompt (criterion not met, correctness bug, security
gap, data loss, broken build, a test that proves nothing), these send a PR back here.

TODO: the repository's hard rules, each with the rule's name or number so findings can cite it.

## Persona check (optional)

TODO: how to walk the change as a real user on the evidence pass (a skill, a script, a manual
browser path), or "none".

## Never

TODO: things no factory session may do in this repository (deploy, touch live data, message real
people, delete volumes…).
