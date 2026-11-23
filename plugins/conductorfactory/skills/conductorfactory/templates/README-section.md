## Factory

Work can be handed to a local software factory through GitHub issues. Create an issue, add the
`factory:queue` label, and coding agents pick it up: they build it, test it against the issue,
review it and open a pull request that closes the issue. Status, questions and test evidence come
back as comments on the issue; the code and its review are on the pull request, which a human
approves and merges.

The issue is the whole brief, so write it to be built: [`FACTORY.md`](./FACTORY.md) says what to
put in it (problem, expected behaviour, exact acceptance criteria, what is out of scope) and what
each `factory:` label means. When the task is about something visible, attach screenshots or a
short recording to the issue, with private details cropped out; `FACTORY.md` shows how.

An assistant filing issues for someone (for example instinct) queues them directly, attaches the
screenshots it was given, then follows it up on its own: it carries the factory's questions to that
person and their answers back, and when the pull request is ready sends them a summary with the
screenshots and videos and asks before anything is merged. One with a command line does this with `gh`; one without,
such as instinct, works in a browser and must be signed in to GitHub there.

The factory itself is the [`conductorfactory/`](./conductorfactory/) folder: scripts and agent prompts that need only `node`
and a signed-in `gh`. `conductorfactory/run start` checks the setup and prints the one message
that starts its Coordinator chat in Conductor; `conductorfactory/run status` and
`conductorfactory/run stop` do what they say. The rules its agents follow in this repository are
in [`conductorfactory/project.md`](./conductorfactory/project.md).
