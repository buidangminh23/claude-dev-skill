# Changelog

Releases made by the update workflow list the claude.dev posts and mods that changed since the previous release.

## [0.1.9] - 2026-10-23

### Updated posts on claude.dev

- [Lessons from building Claude Code: How we use skills](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/)
- [A harness for every task: dynamic workflows in Claude Code](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/)
- [Using Claude Code: The unreasonable effectiveness of HTML](https://claude.dev/blog/using-claude-code-the-unreasonable-effectiveness-of-html/)
- [Lessons from building Claude Code: Prompt caching is everything](https://claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything/)
- [Seeing like an agent: how we design tools in Claude Code](https://claude.dev/blog/seeing-like-an-agent/)

### Notes rewritten

- `references/code-review.md`

## [0.1.8] - 2026-10-19

### Updated posts on claude.dev

- [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)

## [0.1.7] - 2026-10-16

### New posts on claude.dev

- 2026-10-15 [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/)

### Notes rewritten

- `SKILL.md`
- `references/code-review.md`

## [0.1.6] - 2026-10-09

### Updated posts on claude.dev

- [Claude Code in the cloud: a field guide to cloud sessions](https://claude.dev/blog/claude-code-in-the-cloud/)

### Notes rewritten

- `references/cloud-sessions.md`

## [0.1.5] - 2026-10-09

### Notes rewritten

- `SKILL.md`
- `references/agent-automations.md`

## [0.1.4] - 2026-10-08

### New posts on claude.dev

- 2026-10-08 [Building effective agent automations](https://claude.dev/blog/building-effective-agent-automations/)

## [0.1.3] - 2026-10-07

### Updated posts on claude.dev

- [Getting started with Claude Code mods](https://claude.dev/blog/getting-started-with-claude-code-mods/)

## [0.1.2] - 2026-10-06

### New posts on claude.dev

- 2026-10-06 [Claude Code in the cloud: a field guide to cloud sessions](https://claude.dev/blog/claude-code-in-the-cloud/)

### Notes rewritten

- `SKILL.md`
- `references/cloud-sessions.md`

## [0.1.1] - 2026-10-06

### Notes rewritten

- `references/effort.md`

## [0.1.0] - 2026-10-06

### Added

- The `claude-dev-skill` skill: a `SKILL.md` router and 12 topic notes, written in the project's own words from the 13 posts published on claude.dev as of 2026-10-06.
- Generated references: `index.md` lists every post with its sections and markdown links, and `mods-catalog.md` lists the mods shown on claude.dev.
- `scripts/claude-dev.mjs` inside the skill, with `whatsnew`, `index`, `search` and `read` commands that query the live site.
- An hourly update workflow: change detection with conditional requests; distillation in a read-only job with the Claude Code GitHub Action when `CLAUDE_CODE_OAUTH_TOKEN` is set; a separate publishing job that re-checks wording, links, risky commands, scope, size and secrets on its own checkout; and releases that are verified against the installer contract before they are marked latest.
- Plugin manifests for Claude Code, Codex, Gemini CLI and agent marketplaces.
