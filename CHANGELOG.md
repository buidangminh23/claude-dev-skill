# Changelog

Releases made by the update workflow list the claude.dev posts and mods that changed since the previous release.

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
