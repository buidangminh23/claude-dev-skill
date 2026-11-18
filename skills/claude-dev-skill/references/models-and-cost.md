# Choosing a model and keeping task cost down

Use this note to choose the model a task starts on and to decide which setting to change when a task costs more than it should. It is distilled from the two posts below in this project's own words.

Sources: [Building with Claude Sonnet 5.5](https://claude.dev/blog/building-with-claude-sonnet-5-5/) (2026-09-28), [What a task costs on Opus 5.5](https://claude.dev/blog/what-a-task-costs-on-opus-5-5/) (2026-09-25)

## Use this when
- You are picking `/model` for a session or `model:` for a subagent.
- A plan limit drains quickly, or `/usage` shows a dollar estimate far above your usual.
- An attempt fell short and you must choose between adding a check, raising effort and moving up a tier.
- You are about to pause, switch models, turn on fast mode or connect an MCP server partway through a session.
- CLAUDE.md or another always-loaded file keeps growing, or you are moving API code or prompts onto a 5.5-generation model.

## Guidance

### Budget per finished task
Price a task by what finishing it takes: one retry outweighs what a lower level, a cheaper model or a trimmed context saves. The bill has four parts:
- **Turns:** each re-sends all prior context, so cutting turns saves the most; gathering context in one pass and batching tool calls help.
- **Cache reads:** most re-sent text bills at a tiny share of the input rate; the hit rate moves input cost more than any other setting.
- **Output:** the dearest tokens (5x input on Opus 5.5); thinking bills as output even when Claude Code shows only a summary, so effort moves the bill.
- **Model:** its prices apply to every token, including those of subagents that inherit it.

### Pick the starting tier
| Work | Start on |
|---|---|
| Well-scoped work with a firm spec plus a runnable check; high-volume development; repeatable agent jobs; polished documents, slides and spreadsheets | Sonnet 5.5 |
| Careful judgment, long-horizon agentic coding and knowledge work; in Claude Code, work you supervise (features across a few files, debugging, reviews that lead to edits) | Opus 5.5 |
| Quality outweighs token cost: unwatched long runs, problems with no pattern to copy, large changes coordinating many subagents | Fable 5.1 |
| Lookups: search-and-summarize subagents, scanning logs and test results | Haiku or Sonnet |

- Don't pass code edits to a smaller-model subagent; a rote change over many files stays on Opus 5.5 at low effort.
- Move to Fable 5.1 once Opus 5.5 at xhigh fails the same problem twice, and come back after; interactive work stays on Opus 5.5 (faster, cheaper).
- Sonnet 5.5 at xhigh or max thinks longer and costs more; weigh Opus 5.5 first.
- Claude Code's `default` is Opus 5.5 (v2.1.280 or newer). From v2.1.284, `/model sonnet` selects Sonnet 5.5 at medium effort. Haiku 5.5 was announced but not out (as of 2026-09-28).

### When a task stalls: check, effort, then model
The clearest signal that more effort is due: the change lands in one layer and misses the next (a field renamed in the handler, tests green, the client still sending the old name). Before raising effort:
1. **Let the model check itself** (a test, a build, a script hitting the endpoint) and begin multi-file changes in plan mode. A test routed through the client fails the turn the bug appears, even at medium.
2. **Go from medium to high.** It costs more per turn than medium yet less than a model upgrade.
3. **Switch models** only when checks and more effort both failed.

### Effort as a cost lever
- Choose levels afresh on a new model: Opus 5.5 reasons more at each level than Opus 5 (most at xhigh and max).
- Opus 5.5 in Claude Code defaults to medium (Opus 5 used high): medium for well-scoped work, high when medium stalls, low for renames or repeating a known pattern, xhigh or max only with a measured gain.
- Sonnet 5.5 on the API defaults to high; agent loops with multistep tool use start at medium, chat at medium or low. Lower effort for less thinking; asking in the system prompt is unreliable.
- Opus 5.5 always thinks before replying, so there is no thinking setting. It ends long runs with a report that can save reruns.
- `/effort <level>` applies from the next request; `/effort status` shows it. On an API key or subscription Opus 5.5 keeps its cache across the switch; on Bedrock, a Claude apps gateway or Google Cloud's Agent Platform it wipes the cache, so switch at a break.

### Subagents and agent teams
- Set lookup subagents' models on purpose: `model: haiku` or `model: sonnet` in the definition, or `CLAUDE_CODE_SUBAGENT_MODEL` for all (the definition wins). Otherwise a subagent runs on, and pays for, the main model.
- Give small models only work whose mistakes are cheap to catch; keep judgment calls and code edits on the main model. `opusplan` (Opus plans, Sonnet executes) does the reverse; trial it first.
- Agent teams are experimental and every teammate keeps spending until it exits: keep teams small, tasks self-contained, and stop teammates when done.

### Keep the cache warm
- Settle model, MCP servers and fast mode at session start. The cache reuses only an unchanged prefix, so the next request pays a write after an idle gap beyond the lifetime, a model switch, a compaction, an MCP change, first-time fast mode, or an effort change on a cloud provider or gateway. Editing tool definitions wipes it; a system-prompt change invalidates everything after it.
- Lifetime in Claude Code: 60 minutes on a subscription until usage credits kick in, then five; five for API-key and cloud-provider users. Each hit restarts the clock free.
- Switch models at a break, after `/compact` or in a new session from a short written plan. Fast mode's first request pays the fast input rate on the whole uncached history, so enable it at the start.

### Keep the re-sent context small
- `/clear` is free between unrelated tasks. `/compact` at a natural pause, naming what must survive: while the cache is warm, before a break rather than after, not just before finishing. `/rewind` drops a dead end; `/autocompact <tokens>` sets the threshold.
- Keep CLAUDE.md short (the [costs docs](https://code.claude.com/docs/en/costs) suggest under 200 lines) and turn off unused MCP servers with `/mcp`.

### Migrating to a 5.5 model
- Run `/claude-api prompt-audit` over skills and CLAUDE.md to find older-model instructions (forced multi-step routines, scratchpad or verify-twice rules, conflicts) that push Opus 5.5 toward longer output; compare `/usage` before and after.
- API code moving off Sonnet 5: swap in `claude-sonnet-5-5`; `/claude-api migrate this project to claude-sonnet-5-5` applies the changes and the [migration guide](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide) covers the breaking ones. Thinking runs by default, so iterate content blocks by type, never `content[0].text`. Then drop Sonnet 5 workarounds, re-run evals and redo the effort sweep.

### Measure your own sessions
- After a task run `/usage` (or `/cost`): tokens, a locally computed list-price estimate and a prompt-cache line. On a subscription the dollar figure gauges work, not a bill.
- Low cache share: look for a cache breaker. Much output for a small change: effort too high or retries. Total input many times the conversation size: too many turns.
- Compare models by running the same real backlog task on each, recording turns, output tokens and dollars, over three or four tasks. Teams can use the Claude Code Analytics API and the Usage and Cost API.

## Numbers worth knowing
List prices from the posts (2026-09-25 and 2026-09-28); confirm in the [pricing docs](https://platform.claude.com/docs/en/about-claude/pricing).
- Per million tokens: Opus 5.5 $4 input, $20 output, $0.20 cache read; Sonnet 5.5 $2, $10, $0.20; Fable 5.1 $10, $50, $0.25.
- Cache writes cost 1.25x input (five-minute) or 2x (one-hour); at 120K context about $0.60 or $0.96 versus about $0.02 per read.
- Illustrative 40-turn Opus 5.5 task (20K growing to 120K context): 2.8M input tokens cost $11.20 uncached, $1.62 at 90% cache hits, about $0.99 at 96%; in 25 turns, $1.02.
- High effort adding 20K thinking tokens costs about $0.40: worth it only when it saves a retry. Compacting at 150K costs about $0.25 warm, about $0.75 cold.
- Fast mode: up to 2.5x faster at 2x the price. Batch API: half price. Plan-mode agent teams: about 7x the tokens.
- Sonnet 5.5 keeps Sonnet 5's prices but usually needs fewer tokens.
- "40% cheaper than Opus 5" is an estimate for typical token-billed work that counts fewer tokens per task; per token Opus 5.5 is 20% cheaper on input and output and 60% on cache reads. Subscription limits go about 25% further; the cache-read cut is API only.
- Enterprise spend averages about $13 per developer per active day (90% under $30).

## Pitfalls
- Carrying an effort level over from an older model.
- Letting subagents inherit the main model's price, or moving code edits to a small model to save money.
- Waiting for a third failure before escalating, or staying on the bigger model because `/model` persisted.
- Breaking the cache mid-session, or compacting after a break instead of before.
- Treating the 40% figure as a per-token cut, or judging a model from one task.

## See also
- [effort.md](effort.md), [prompt-caching.md](prompt-caching.md), [long-runs.md](long-runs.md), [context-engineering.md](context-engineering.md), [workflows.md](workflows.md), [evals.md](evals.md)
- If your agent has the built-in `claude-api` skill, use it for current prices and parameters and for its `migrate` and `prompt-audit` commands.
