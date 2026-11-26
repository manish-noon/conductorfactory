# Factory: how to hand work to it

This repository has a **factory**: label a GitHub issue and coding agents build it, test it, review
it and open a pull request for a human to approve. This file is for whoever writes the issue, a
person or another agent. A good issue is the whole job: the factory builds exactly what the issue
says and checks its work against it.

## How it works

1. You create a GitHub issue and add the label **`factory:queue`**.
2. Within a few minutes the factory claims it: the label becomes `factory:building` and a
   "Factory run" comment appears on the issue, edited in place as the work moves on.
3. A **Builder** explores the code, then builds it directly, making and recording its own
   assumptions. It writes a plan first only for a genuinely complex change or one the repository's
   rules reserve for your decision (label `factory:needs-planning`; all its questions at once, on the issue).
4. The Builder opens a **draft pull request** that says `Closes #<issue>` and lists the acceptance
   criteria, each one pointing at the test that proves it.
5. A **Verifier** checks the PR against the issue (not against the Builder's own summary) and runs
   the tests. A **Reviewer** reviews the code. Anything blocking goes back to the Builder, up to
   five rounds.
6. When both pass and CI is green, the PR is marked **ready for review** and the label becomes
   `factory:in-review`. A human approves and merges; the issue closes with `factory:shipped`.
7. If the factory cannot finish, the label becomes `factory:needs-human` and a comment on the
   issue says why.

Everything comes back to GitHub: status, questions and test evidence (with screenshots and videos
when the tests make them) as comments on the **issue**;
the code, the review and replies to findings on the **pull request**. Factory comments start with
`factory_ai:`.

The label names here are the defaults; `conductorfactory/config.json` can change them.

## Writing an issue the factory can build

**One issue, one change.** If it needs "and also", write two issues. Small issues (under a few
hundred changed lines) finish without a human; the factory stops for planning only when a change is
genuinely complex or the repository's rules reserve it for you.

### Title

What changes, in plain words, as an outcome: "Uploaded file names keep their extension", not "Fix
upload bug" or "Refactor upload.ts".

### Body

Use these headings. The first three are required.

```markdown
## Problem
What is wrong or missing today, and who it affects. For a bug: the exact steps, what happens, what
should happen, and the error text or log line if there is one. Name the files or screens if you
know them.

## What should happen
The behaviour after the change, from the user's side. Say what is true afterwards, not how to code it.

## Acceptance criteria
- [ ] One checkable statement per line, with the exact expected value.
- [ ] Cover the edge cases that matter (empty, missing, too long, not allowed).
- [ ] Say what must NOT change, if something nearby is easy to break.

## Out of scope
What not to touch, so the factory does not grow the change.

## Context
Links to the spec, decision record, design, related issues or PRs. Decisions already made.
Constraints (must work offline, must not add a dependency, …).
```

For anything visual (a screen, a layout, an error dialog), attach a screenshot or a short recording
of what it looks like today, and a sketch or example of what it should look like if you have one.
How to attach, and what can go wrong, is in [troubleshooting](./conductorfactory/troubleshooting.md).

### Acceptance criteria decide the result

The Verifier fails the work for any criterion without a test, and for anything the issue asks that
the PR leaves out. So:

- **Exact, not vague.** "A reply's subject starts with `Re: ` exactly once" can be tested. "Replies
  look right" cannot.
- **Observable.** State what a user, an API caller or a stored record shows. Not "the code is cleaner".
- **Complete.** Anything not written down is not built and not checked.
- **Provable by an automated test** in this repository. The factory does not test against live or
  production systems; an issue that can only be proven there is not for the factory.

### Do not

- Put secrets, tokens, personal data or private message text in an issue.
- Ask for several unrelated changes in one issue.
- Expect it to ask: a decision left open ("either A or B is fine") is settled by the factory and
  listed under Assumptions in the PR; correct it there if it chose wrong. If you do want a plan first, say so: "Plan first: propose the approach before building."
- Add `factory:queue` to an issue that is still a rough idea. Label it when it is ready to build.

## Creating the issue from the command line

For people and agents with a terminal. Without one, create the issue in the browser and add the
`factory:queue` label there.

```sh
gh issue create --title "<title>" --body-file issue.md --label "factory:queue"
```

Add the repository's usual labels (area, priority) as well. To queue an existing issue:
`gh issue edit <number> --add-label "factory:queue"`.

## Who builds it: several people, one repository

Each person runs their own factory under their own GitHub login, and every issue has one owner:

- **By default the owner is whoever created the issue.** Leave it unassigned and the creator's
  factory picks it up, and assigns it to them when it starts. Who adds `factory:queue` does not
  matter.
- **Only an explicit assignee changes that.** Assign the issue to someone else and their factory
  builds it instead.
- **To give a task to someone else**, assign it to them when you queue it:
  `gh issue create … --label "factory:queue" --assignee <their login>`, or pick them under
  Assignees in the browser. An assistant told "assign this to" a teammate does exactly that.
- **To move a task that is already running**, change the assignee. The first factory pushes its
  work and lets go; the new owner's factory continues on the same branch and pull request.
- **Anyone can comment** with answers or change requests. The owner's factory handles them.
- The owner's factory must be running for anything to happen: an issue assigned to someone whose
  factory is off simply waits.

## If you are an agent filing issues for someone

- **Whose task it is.** By default leave the issue unassigned: it then belongs to its creator.
  Assign it only when the person names someone else, or when you create issues under an account
  that is not theirs (then assign it to them).
- **Queue it straight away.** When the task is clear enough to write exact acceptance criteria,
  create the issue with the queue label without asking the person to confirm. Ask first only
  when it is too vague to write them.
- **Attach what they showed you.** Add screenshots or recordings with `--attach` (see
  [troubleshooting](./conductorfactory/troubleshooting.md)). Crop or blur anything private first: names, messages,
  tokens.
- **Use what you have.** With a command line, create the issue with `gh` (below). Without one
  (instinct, for example), do it in a browser signed in to GitHub: open the repository's Issues
  tab, create the issue, add the queue label, and drag or paste the files into the description.
  If you cannot attach a file either way, create the issue anyway and say in it, and to the
  person, which file is missing.
- **Then follow it up yourself**, as the next section says. Filing the issue is half the job.

**Handing tasks to an assistant** (for example instinct). One standing instruction is enough:

> When I give you a task for a repo, follow its README to queue it, and tell me only when I'm needed.

An assistant with a command line uses `gh` and needs nothing more. One without a command line,
such as instinct, works through a browser: sign it in to GitHub there, or it can neither create
the issue nor attach your screenshots.

## Coordinating a task for someone (for agents such as instinct)

After you queue an issue for a person, you own the follow-up until its pull request is merged or
the issue is closed. The person should not have to ask how it is going, and the factory should
never sit stuck because nobody carried its question to them.

**1. Check regularly, on your own.** Look at the issue, its labels, its newest comments and its
pull request every 10 to 15 minutes while it is being worked on, and at least every hour while it
waits on the person. Keep a note of the last comment you handled so nothing is handled twice.
Factory comments start with `factory_ai:`; the "Factory run" comment shows the current stage.

**2. While it works, keep it light.** `factory:building`, `factory:verifying` and
`factory:reviewing` need nothing from the person. Tell them when it starts and keep them posted
at the points that matter (a plan needed, a question, the pull request ready, merged), unless
they said they do not want updates.

**3. When the factory is stuck on the person, unstick it.** It is stuck when the label is
`factory:needs-planning` or `factory:needs-human`, or the newest `factory_ai:` comment asks a
question or says a chat is waiting for an answer.

- Take the question to the person at once: what the factory asks, in plain words; the options it
  gave and the one it recommends; what you would answer and why, if the task makes that clear;
  and the link.
- Post their answer as a comment on the issue, in their words or a faithful short version. For a
  plan they accept, the comment says "approved". The factory picks it up within a few minutes
  and carries on.
- Check that it moved: the label should change within about ten minutes. If it does not, tell
  the person.
- Never write a comment that starts with `factory_ai:`: the factory ignores those.
- **Keep following up.** If the person does not reply, ask again, a few times over the day and
  then daily, each time with the question restated so they can answer in one message. Stop only
  when they answer or tell you they do not want updates on that issue.
- **Give a round-up of what is still stuck.** When several issues wait on them, or one has waited
  more than a day, send one list of every issue in `factory:needs-planning` or
  `factory:needs-human`: title, link, what it waits for, and since when. Ask for each whether to
  answer it, change it or close it, then do what they say: post the answer, edit the issue, or
  close it.

**4. When the pull request is ready (`factory:in-review`), report and ask.** Send the person:

- a short summary: what was asked, what the factory built, and anything it assumed or left out
  (the PR description lists **Assumptions** and the acceptance criteria);
- the evidence: the screenshots and videos from the factory's evidence comment on the issue,
  sent as files or shown inline, not only as links;
- the test result in one line, and the links to the pull request and the issue;
- one question: approve and merge, or change something?

Then act on their answer, and only on it:

- **They want a change:** post it as a comment on the issue or the pull request, as exactly as
  they said it. The factory changes the same pull request, checks it again and posts new
  evidence; when it is back at `factory:in-review`, report again.
- **They approve:** approve and merge the pull request if you are allowed to and they told you
  to; otherwise tell them it is theirs to merge. Never merge, approve or close anything without
  their explicit yes for that pull request.

**5. Close the loop.** When the label is `factory:shipped`, tell the person in one line that it
is merged. If the issue was closed without a merge, say so and why.

**Privacy.** Evidence can show private content. Send it only to the person the task belongs to,
through the channel they use with you, and nowhere else.

## After you queue it

| You see | It means | You do |
|---|---|---|
| `factory:building`, `factory:verifying`, `factory:reviewing` | The factory is working | Nothing |
| `factory:needs-planning` | The Builder has questions or a plan to approve, posted on the issue | Answer in a comment; say "approved" when the plan is right |
| `factory:in-review` | The PR is ready | Review and merge the PR |
| `factory:needs-human` | The factory stopped; the reason is on the issue | Comment with a decision or fix (it resumes), or take over the branch |
| `factory:shipped` | Merged | Nothing |

- **To change or add something, at any point until the PR is merged:** comment on the issue or on
  the PR (a normal comment, a review, or a line comment). Within a few minutes it goes to the same
  Builder chat that built it, which makes the change, pushes to the same PR and replies where you
  commented. The change is then verified and reviewed again and new evidence is posted. This
  includes asking for changes after looking at the screenshots or video. Start the comment with `reviewer:` or `verifier:` to reach them instead.
- **To pause:** add `factory:paused`. **To resume:** add `factory:queue` again.
- **To cancel:** close the issue.
- Do not change the other `factory:` labels by hand; the factory puts them back.

## Troubleshooting and known issues

Attaching screenshots and videos (command line and browser), and what to check when several people
share the repository, are in [`conductorfactory/troubleshooting.md`](./conductorfactory/troubleshooting.md).

## For whoever runs the factory

The factory runs on one machine, in Conductor, from the [`conductorfactory/`](./conductorfactory/) folder in this
repository. It needs only `node` and a signed-in `gh`:

```sh
conductorfactory/run start    # checks the setup and prints the one message that starts the Coordinator chat
conductorfactory/run status   # is it running, and where each issue is
conductorfactory/run stop     # stop routing work; start continues where it stopped
```

**Starting it, step by step** (for a person or an agent; any agent or model Conductor offers will do):

1. In a Conductor workspace of this repository, run `conductorfactory/run start`. It checks
   `conductorfactory/project.md`, makes sure the labels exist on GitHub and prints a
   `coordinatorMessage`.
2. Open a **new chat** in that workspace and send that message as its first message, word for
   word. An agent does this with Conductor's `CreateSession` tool (title `Factory Coordinator`).
   That chat becomes the Coordinator: it follows
   [`conductorfactory/prompts/coordinator.md`](./conductorfactory/prompts/coordinator.md), starts
   the watcher and creates a workspace with Builder, Verifier and Reviewer chats for each queued issue.
3. Keep that workspace: it is the **Factory home**, and its `.context/factory/state.json` is the
   factory's memory. Conductor must stay open.

What is in the folder:

| Path | What |
|---|---|
| `conductorfactory/run` | The launcher for every command (`run` with no command lists them) |
| `conductorfactory/prompts/` | What the Coordinator, Builder, Verifier and Reviewer follow |
| `conductorfactory/bin/` | The scripts: polling GitHub, the state file, issue and PR comments, labels |
| `conductorfactory/config.default.json` | Every setting and what it means |
| `conductorfactory/config.json` | This repository's overrides (which agent and model the workers use is `sessions`) |
| `conductorfactory/project.md` | This repository's rules for the agents |
| `conductorfactory/troubleshooting.md` | Attaching files, and several people sharing the repository |

The optional `conductorfactory` skill (Conductor Factory) only installs or updates this folder (`/conductorfactory setup`); nothing
here runs from it.
