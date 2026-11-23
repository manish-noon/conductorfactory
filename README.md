# Conductor Factory

A local software factory driven by GitHub issues, as a Claude Code plugin. Label an issue and
Conductor sessions triage it, plan with you when needed, build, verify, review and prepare the PR
for your approval. Needs a signed-in `gh` and Node 22 or newer.

## Install

In Claude Code:

```
/plugin marketplace add manish-noon/conductorfactory
/plugin install conductorfactory@conductorfactory
```

Then, in a repository: `/conductorfactory setup`, and `/conductorfactory start` to run it.

Updates: `/plugin marketplace update conductorfactory`, or turn on auto-update under
Marketplaces in `/plugin`.

## Layout

- `.claude-plugin/marketplace.json`: the marketplace
- `plugins/conductorfactory/`: the plugin; the skill is in `skills/conductorfactory/`
