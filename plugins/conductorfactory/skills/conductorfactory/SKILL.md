---
name: conductorfactory
description: Conductor Factory. Run a local software factory on GitHub issues in Conductor. Label an issue and Conductor sessions triage it, plan with you when needed, build, verify, review and prepare the PR for your approval. Use for /conductorfactory setup, /conductorfactory start, /conductorfactory stop and /conductorfactory status, or to debug a factory run.
---

# Conductor Factory

A local software factory driven by GitHub issues. Add the queue label (`factory:queue` by default)
to an issue, and Conductor sessions triage it, plan with you if it needs a decision, build it,
verify it against the issue, review it, and hand you a PR to approve. GitHub holds the state
(issue labels and comments); all work happens in Conductor workspaces on this machine.

It needs only the `gh` CLI, already signed in, and Node 22 or newer. No API keys, no `.env`.
Once set up, a repository carries the whole factory in its `conductorfactory/` folder.

## Flow

```
You: add the queue label to a GitHub issue
  └─► Coordinator (woken by a background watcher) claims it, creates a workspace
        └─► Builder tab: triage ─┬─ plan needed → factory:needs-planning → you plan (chat or issue comments) → approve
                                 └─ build → run its tests → draft PR (acceptance criteria in the body)
        └─► Verifier tab: check pass (issue → ask, ask vs PR criteria, test audit, then run the tests)
        └─► Reviewer tab: review on the PR; only blocking findings send it back
              any send-back → Builder fixes → check pass → review (only what changed)   ≤ limits.maxRounds
        └─► Verifier tab: evidence pass (reuses the check pass's results; summary on the issue)
        └─► PR marked ready (+ auto-merge if the repo allows) → factory:in-review → you approve → merged → factory:shipped
  over limits.maxRounds or any failure → factory:needs-human (assigned to you, issue + PR comment)
```

One workspace per issue, three tabs: **Builder**, **Verifier**, **Reviewer**. Verifier and Reviewer
are separate sessions so they never see the Builder's reasoning. Only one works at a time; the
Coordinator enforces the order.

## What is where

This skill is the installer and the master copy. `/conductorfactory setup` copies the whole factory into
the repository's `conductorfactory/` folder, and from then on the repository runs it by itself:
every command is a script in that folder, and the skill is not needed to start, stop or run it.

In this skill:

| Path | What |
|---|---|
| `setup.mjs` | Installs or updates `conductorfactory/` in a repository |
| `conductorfactory/` | The factory itself, copied as is: `run`, `bin/`, `prompts/`, `config.default.json` |
| `templates/` | The repository's own files, created only when missing: `config.json`, `project.md`, `FACTORY.md`; and `README-section.md`, the text setup adds to the README |

In a repository, after setup (all tracked in git):

| Path | What |
|---|---|
| `conductorfactory/run` | The launcher: `conductorfactory/run <command>` |
| `conductorfactory/bin/` | The scripts behind every command |
| `conductorfactory/prompts/` | `coordinator.md`, `builder.md`, `verifier.md`, `reviewer.md` |
| `conductorfactory/config.default.json` | Every setting and its default |
| `conductorfactory/config.json` | The repository's overrides |
| `conductorfactory/troubleshooting.md` | Attaching files; several people sharing the repository |
| `conductorfactory/project.md` | The repository-specific rules: what to read, checks, how acceptance tests run, plan-first tripwires, blocking review rules, what never to do |
| `FACTORY.md` (root) | For whoever writes issues, human or agent: how the factory works, how to write an issue it can build (with screenshots when the task is visual), rules for an assistant filing issues for someone, what each label means, and troubleshooting for attaching files |

Commands, all as `<Factory home>/conductorfactory/run <command> …`:

| Command | What |
|---|---|
| `start [--takeover]` | Check the setup, make sure the labels exist, clear a previous stop, print the message that starts the Coordinator chat. Refuses if this login's runs belong to another Factory home, unless `--takeover` |
| `stop` | Stop the watcher and keep it stopped |
| `status` | Is it running, and where each issue is |
| `config [key]` | The merged settings, or one value |
| `labels` | Create every factory label on GitHub |
| `events` | One poll: new issues, labels and status guard, PR + CI, worker results, human comments |
| `watch` | The Coordinator's watcher: polls at no model cost, exits when there is work |
| `state show\|set\|log\|phase\|render\|archive\|metrics` | The Coordinator's state file and run comment |
| `issue show\|queue\|owner\|assign\|status\|size\|outcome\|assign-me\|comment\|evidence` | Issue reads and writes |
| `pr show\|feedback\|comment\|label\|unlabel` | PR reads and writes |
| `commit …` | `git commit` with the factory trailer |
| `gh …` | `gh` with the factory's environment |

## Commands

The user runs these as `/conductorfactory <command>`. With no command, show `status` if `conductorfactory/` exists,
otherwise offer `setup`. `<skill>` is this file's folder; `<run>` is `<repository root>/conductorfactory/run`.
Apart from setup, each command only runs the repository's own script and reports what it printed.

### `/conductorfactory setup`

Does everything a repository needs, once. Do each step; skip one only when it is already done.

1. **Check the tools:** `gh auth status` succeeds, `node --version` is 22 or newer, and the
   repository has a GitHub remote. Stop and say what is missing otherwise. If
   `gh issue comment --help` has no `--attach`, gh is too old to upload evidence: offer to upgrade it.
2. **Install the factory:** `node <skill>/setup.mjs` from the repository. It copies the launcher,
   scripts, prompts and default settings into `conductorfactory/` (replacing an older copy), and
   creates `conductorfactory/config.json`, `conductorfactory/project.md` and `FACTORY.md` at the
   root only when they are missing. Run it again to update a repository to this skill's version.
3. **Fill in `conductorfactory/project.md`.** Read the repository's `CLAUDE.md`, `AGENTS.md`,
   `CONTRIBUTING.md`, CI workflows and Git hooks, then write every section from what they say:
   what to read, the checks, how acceptance tests run and what must never be started or touched,
   the plan-first tripwires, the blocking review rules, the Never list. Leave no `TODO`. Link to
   the repository's docs instead of repeating them.
4. **Settings:** leave `conductorfactory/config.json` at its defaults unless the repository needs otherwise
   (`git.baseBranch: null` means the default branch). If label names or `limits.maxRounds` change,
   update the same names in `FACTORY.md`.
5. **Create the labels on GitHub:** `<run> labels`.
6. **README:** add the section in `<skill>/templates/README-section.md` to the repository's README
   (before its closing sections), unless a "Factory" section is already there. Keep its content:
   label an issue and agents bring back a PR; attach screenshots for visual tasks; an assistant
   queues directly and comes back only when needed, with `gh` if it has a command line and
   through a signed-in browser if it does not; `conductorfactory/run start` starts it. Fix any link that does not
   resolve in this repository.
7. **`FACTORY.md` already present from an older setup:** setup never overwrites it. Compare it
   with `<skill>/templates/FACTORY.md` and offer to bring over the sections it lacks (the
   assistant section, the screenshot guidance, **Troubleshooting and known issues**).
8. **Report:** end with the "What to do next" list `setup.mjs` printed, adjusted for the steps you
   already did (labels, README, `project.md`), so the user knows to commit the files and run
   `conductorfactory/run start`. Also say what was created, the `project.md` sections the user should read (it is the
   factory's understanding of their repository's rules), the standing instruction for an
   assistant (below), and that `/conductorfactory start` is next.
   Commit nothing unless the user asks.

### `/conductorfactory start`

1. `<run> start`. It checks `project.md`, makes sure the labels exist, clears a previous stop and
   prints the status with a `coordinatorMessage`. If `conductorfactory/` is missing, run setup
   first. If it fails, report its message; when it says the runs belong to another Factory home,
   ask the user whether that home is gone before running `<run> start --takeover`. If `watcherPid` is set, a Coordinator is already
   running here: say so and stop.
2. Start the Coordinator in its **own chat**, so this one stays clean: with Conductor's
   `CreateSession` in this workspace, title `Factory Coordinator`, and the printed
   `coordinatorMessage` as its message, word for word. If a `Factory Coordinator` chat already
   exists and is idle, send it that message instead. Without Conductor's session tools, become
   the Coordinator in this chat: read the file the message names and follow it.
3. Tell the user: the workspace this ran in is the **Factory home** (don't archive it: its
   `.context/factory/state.json` is the factory's memory), and adding the queue label to an issue
   is what starts work.

### `/conductorfactory stop`

`<run> stop`. The watcher ends and refuses to restart, so the Coordinator routes nothing further.
Sessions already working finish their current turn; their results wait in the state file and are
picked up on the next start. Report the issues that were in flight (from the printed status).
Nothing is lost: `/conductorfactory start` continues where it stopped.

### `/conductorfactory status`

`<run> status`, then for detail `<run> events`. Report per issue: phase, round, PR and workspace
links, and anything waiting on the user (planning, review, needs human). Say whether the factory
is running, stopped, or has no Coordinator (no watcher and not stopped: suggest `/conductorfactory start`).

### Pausing or cancelling one issue

These are done on GitHub, not here: add the pause label to pause, the queue label again to resume,
close the issue or its PR to cancel.

## Several people, one repository

Each person runs their own factory under their own `gh` login. By default an issue's
**owner is whoever created it**; only an explicit assignee changes that. (`github.claimFor` lists
other logins whose issues this login takes, for an assistant that files under its own account.) A Coordinator only
ever sees its own issues, so two factories never compete for one.

- Give a task to someone: assign the issue to them (`<run> issue assign <N> <login>`, or on GitHub).
- Move a running task: change the assignee. The old factory pushes and lets go (phase
  `released`); the new one continues the branch and PR in **Mode: takeover**.
- The run's essentials (owner, Factory home, phase, round, branch, PR) are kept in a hidden marker
  on the "Factory run" comment, so a run survives a lost workspace: `/conductorfactory start`
  refuses while this login's runs belong to another Factory home, and
  `<run> start --takeover` adopts them.
- `<run> issue owner <N>` shows who owns an issue and its stored run state.
- One Coordinator per login per repository.

## Handing tasks to an assistant

The user may give tasks to an assistant (for example instinct) that files the issues. The README
section and `FACTORY.md` tell it everything, so one standing instruction is enough:

> When I give you a task for a repo, follow its README to queue it, and tell me only when I'm needed.

An assistant with a command line creates the issue and attaches screenshots with `gh`
(`--attach`, images and videos only, recent gh). One without a command line, such as instinct,
does both in a browser: tell the user to sign it in to GitHub there, or it can neither create
the issue nor attach files. `FACTORY.md` has the
commands and known issues under **Troubleshooting and known issues**.

## Factory home

The workspace `/conductorfactory start` runs in is the **Factory home**: every Builder, Verifier and
Reviewer reads its `conductorfactory/` folder by absolute path. So the factory can run from an uncommitted
worktree while you iterate, and every session uses the same version. Never use `/loop` for the
Coordinator: each firing adds to its context even when nothing happened.

## Talking to the factory

- **Every factory comment starts with `identity.commentPrefix`.** It posts with your own GitHub
  login, so the prefix is how it tells its messages from yours. Anything without it, from anyone
  but a bot, is human feedback.
- **The issue is for conversation:** status, questions, planning answers, escalations, evidence.
  **The PR is for code:** the review, replies to findings, line comments.
- **Comment and the Coordinator routes it** within a tick: to the Builder by default, the Reviewer
  when you dispute a finding, the Verifier for tests and evidence. Start a comment with `builder:`,
  `reviewer:` or `verifier:` to choose. Your feedback never uses up a round.
- **Pause** by adding the pause label; **resume** by adding the queue label again. **Stop** by
  closing the issue or its PR.

Your touch points: `factory:needs-planning` (plan in the Builder chat or by commenting),
`factory:in-review` (approve the PR), `factory:needs-human` (take over).

## Debug

From the Factory home: `conductorfactory/run events` and `conductorfactory/run state show <issue number>`.
To change the factory itself, edit this skill's `conductorfactory/` and run setup again in each
repository; a repository may also edit its own copy, which the next setup replaces.

## Limits to know

- **Your own identity.** `gh` is yours, so factory comments, assignments and PRs come from you:
  GitHub will not notify you of them and will not let you approve a PR you authored. A machine
  user's `gh` login fixes both.
- **Evidence.** The evidence comment uploads images and videos to the issue (`gh --attach`, which
  needs a recent gh; setup checks). Logs and other files stay in the issue's workspace and are
  listed by path. Set `evidence.attach` to `false` to keep everything on this machine.
- **Cost is read from Claude Code transcripts** (other agents show as not found) when an issue leaves the factory, priced from
  `prices` in the config. The Coordinator's own cost is not included.
- **Conductor must be open.** The Coordinator is a Conductor session; it stops when the app quits.
  Run `/conductorfactory start` again; the state file survives.
- **Machine capacity.** Every active issue is a workspace on this machine. `limits.maxActive` and
  `limits.maxVerifiers` bound the load.
