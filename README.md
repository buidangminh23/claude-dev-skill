<div align="center">

<img src="assets/claude-code.svg" width="112" alt="Claude Code mark">

# claude-dev-skill

### Unofficial, auto-updating agent skill built from the claude.dev engineering blog

<p>Works with&nbsp;
  <img src="assets/claude-code.svg" height="20" alt="">&nbsp;Claude Code
  &nbsp;·&nbsp;
  <img src="assets/codex.svg" height="20" alt="">&nbsp;Codex
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-0078D4?style=for-the-badge)](LICENSE)

</div>

Anthropic's developers publish playbooks and engineering write-ups on [claude.dev](https://claude.dev): how to pick an effort level, what a task costs, how to keep the prompt cache warm, how to write skills and mods, how to design evals. This skill turns them into short working notes an agent can load in the middle of a task, links every note to its posts, and reads the original post from claude.dev when the detail matters.

A scheduled job checks the site every hour. When a post or mod is added or changed, it refreshes the index, rewrites the affected notes and publishes a new release once an independent check passes.

## What's inside

`skills/claude-dev-skill/`

| File | Use it for |
|---|---|
| `SKILL.md` | Routing table, the principles shared across posts, and how to check for newer posts |
| `references/effort.md` | Choosing an effort level |
| `references/models-and-cost.md` | Sonnet or Opus, and what drives the cost of a task |
| `references/long-runs.md` | Briefing, steering and reviewing a long autonomous run |
| `references/context-engineering.md` | Trimming system prompts, CLAUDE.md, rules and memory |
| `references/skills.md` | Writing skills that agents actually use |
| `references/prompt-caching.md` | Request order, tool sets and cache hit rate |
| `references/tool-design.md` | Designing agent tools from the model's side |
| `references/workflows.md` | Dynamic multi-agent workflows |
| `references/mods.md` | Building and choosing Claude Code mods |
| `references/evals.md` | Eval design and hillclimbing |
| `references/html-outputs.md` | When HTML beats Markdown for an output |
| `references/performance.md` | Making software faster with measurable targets |
| `references/index.md` | Every post with its sections and links (generated) |
| `references/mods-catalog.md` | Mods listed on claude.dev (generated) |
| `scripts/claude-dev.mjs` | `whatsnew`, `index`, `search` and `read` against the live site |

Ask your agent, for example:

- "Pick an effort level for this task using the claude.dev guidance."
- "What does claude.dev say about structuring this prompt for caching?"
- "Are there claude.dev posts newer than this skill's notes?"

## Install

#### `npx` · skills

```bash
npx skills add buidangminh23/claude-dev-skill
```

#### Claude Code · plugin (run inside Claude Code)

```text
/plugin marketplace add buidangminh23/claude-dev-skill
/plugin install claude-dev-skill@claude-dev-skill
```

#### Codex · marketplace

```text
codex plugin marketplace add buidangminh23/claude-dev-skill
```

#### Gemini CLI · extension

```bash
gemini extensions install https://github.com/buidangminh23/claude-dev-skill
```

#### Manual

Download `claude-dev-skill-vX.Y.Z.zip` and `SHA256SUMS.txt` from [Releases](https://github.com/buidangminh23/claude-dev-skill/releases), check the hash, and copy `skills/claude-dev-skill` into `~/.claude/skills/` or `~/.codex/skills/`. The `claude-dev-skill-plugin-vX.Y.Z.zip` asset has `plugin.json` at its root for clients that install plugin archives.

The `whatsnew` command needs Node.js 22 or newer and network access. Without them, the skill tells the agent to compare `https://claude.dev/llms.txt` with `references/index.md` instead.

## How it stays current

```text
every hour   detect      conditional GETs to posts.json, llms.txt, /mods/, /terms/ and each post's .md
             index       regenerate index.md and mods-catalog.md, record content hashes
on change    distill     read-only job: the Claude Code GitHub Action edits notes for up to 3 new or
                         edited posts and hands them over as an artifact
             guard       publishing job, on its own checkout: own words (no 12-word run shared with
                         any post, at most 6% shared 6-word sequences), allowed links only, no risky
                         commands, no deleted notes, a line budget, frozen parts of SKILL.md, size
                         limits, no secrets or personal data
             release     bump the version, tag, upload to a draft, re-download and verify, mark latest
anytime      attention   one issue tracks anything that needs a person, and closes itself when clear
```

Posts that cannot be distilled yet stay in a pending list and are retried every six hours. Agents still find them through the generated index and `whatsnew`. Distillation pauses when the claude.dev Terms of Use change, until someone reviews them and updates `data/policy.json`.

### Security model

The model reads text from the web, so it never holds a credential that can change this repository. The distill job runs with a read-only token, may edit only the notes and the description, note table and principles of `SKILL.md`, cannot use web tools, and can run only the guard; its shell commands run inside bubblewrap with the job's credentials scrubbed from their environment. The publishing job never executes anything from the artifact: it copies notes with expected names, fetches the posts itself and runs the guard from `main` before anything is committed. The rest of `SKILL.md`, the scripts and the workflows change only through commits by people. Actions are pinned to commit SHAs and updated by Dependabot.

### One-time setup for maintainers

1. Create a token with `claude setup-token` on your machine, then store it as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN` (`gh secret set CLAUDE_CODE_OAUTH_TOKEN -R buidangminh23/claude-dev-skill`). Only the read-only distill job uses it. Without it, the index and releases still update and the attention issue lists the posts waiting for notes.
2. Optional: `PERSONAL_WEB_DISPATCH_TOKEN`, a fine-grained token with Contents read and write on the Personal-Web repository, so the skill card on the site refreshes right after a release.

### Development

```bash
npm test                                  # unit tests
node scripts/detect.mjs                   # dry run against claude.dev
node scripts/fetch-sources.mjs .cache/sources
node scripts/guard.mjs --sources .cache/sources
node scripts/release.mjs check            # versions, manifests, changelog, web card numbers
```

## Not affiliated with Anthropic

This project is independent. It is not affiliated with, endorsed by, or sponsored by Anthropic. "Claude" and "Anthropic" are trademarks of Anthropic, PBC. Articles on claude.dev belong to Anthropic; this repository does not copy or republish them. It links to them, quotes at most brief excerpts with attribution, and summarizes in its own words. Code samples on claude.dev are MIT-licensed by Anthropic unless a sample says otherwise.

If you hold rights in anything here and want it changed or removed, open an issue in this repository. Distillation can be paused at once, and affected releases will be withdrawn.

## License

MIT for the contents of this repository. See [LICENSE](LICENSE). The Claude Code mark (the project icon) and the Codex mark in `assets/` are trademarks of Anthropic, PBC and OpenAI; they are reproduced unchanged and do not mean either company endorses this project. See [assets/SOURCES.md](assets/SOURCES.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
