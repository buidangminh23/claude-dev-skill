# Choosing a model and keeping task cost down

Use this note to choose the model a task starts on and to decide which setting to change when a task costs more than it should. It is distilled from the two posts below in this project's own words.

Sources: [Building with Claude Sonnet 5.5](https://claude.dev/blog/building-with-claude-sonnet-5-5/) (2026-09-28), [What a task costs on Opus 5.5](https://claude.dev/blog/what-a-task-costs-on-opus-5-5/) (2026-09-25)

## Use this when
- You are picking `/model` for a session or `model:` for a subagent.
- A plan limit drains quickly, or `/usage` shows a dollar estimate far above your usual.
- An attempt fell short and you must choose between adding a check, raising effort and moving up a tier.
- You are about to pause, switch models, turn on fast mode or connect an MCP server partway through a session.
- CLAUDE.md or another always-loaded file keeps growing.
- You are moving API code or saved prompts onto a 5.5-generation model.

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
| Well-scoped work with a firm spec plus a check you can run (bug fixes, fast feature iteration); high-volume development; repeatable agent jobs (investigation, review, drafting); polished documents, slides and spreadsheets | Sonnet 5.5 |
| Careful judgment, long-horizon agentic coding and knowledge work, and the hardest problems when choosing inside the 5.5 family; in Claude Code, work you supervise (features spanning a few files, debugging, reviews that lead to edits) | Opus 5.5 |
| Cases where quality outweighs token cost: long runs nobody watches, problems with no pattern to copy in the codebase, large changes coordinating many subagents | Fable 5.1 |
| Lookups: search-and-summarize subagents, scanning logs and test results, finding where something is defined | Haiku or Sonnet |

- Under an Opus 5.5 session, don't pass code edits to a smaller-model subagent; a rote change spread over many files stays on Opus 5.5 with effort dropped to low (cost post).
- Move to Fable 5.1 as soon as Opus 5.5 at xhigh fails on the same problem twice instead of waiting for a third miss, and come back once it is solved; keep interactive work on Opus 5.5, which responds faster and costs less.
- Before running Sonnet 5.5 at xhigh or max, weigh Opus 5.5: at those levels Sonnet thinks longer, costs more and can lose the mix of quality, speed and price that made it the pick.
- Claude Code's `default` model is Opus 5.5. From v2.1.284, `/model sonnet` selects Sonnet 5.5 on the Claude API at medium effort, with thinking always on and no fast mode. Haiku 5.5, aimed at high-volume, low-latency work, was announced but not yet out (as of 2026-09-28).

### When a task stalls: check, effort, then model
The cost post's clearest signal that more effort is due: the change lands in one layer and misses the next (a field renamed in the handler, its tests green, the client still sending the old name). Before raising effort:
1. **Let the model check itself** (a test, a build, a script that hits the endpoint) and begin multi-file changes in plan mode. A test routed through the client fails on the turn the bug appears, even at medium; one test run costs a turn plus its output, while more effort pays extra thinking on every turn.
2. **Go from medium to high.** High spends more each turn than medium yet less than a model upgrade, and it reads more call sites before writing.
3. **Switch models** only when checks and more effort have both failed.

### Effort as a cost lever
- Choose levels afresh on a new model: Opus 5.5 reasons more at each level than Opus 5 (most at xhigh and max), and Sonnet 5.5's levels were recalibrated against Sonnet 5.
- Opus 5.5 in Claude Code defaults to medium (Opus 5 used high). Medium suits well-scoped work, high is for when medium stalls, low is for renames or repeating a known pattern, and xhigh or max need a measured gain; max holds for one session only.
- Sonnet 5.5 on the API defaults to high, the starting point except for agentic or latency-bound work: agent loops and multistep tool use begin at medium when well specified (high once harder or longer), chat at medium or low; xhigh and max only with an eval-proven gain.
- Lower effort when you want less thinking; asking for less in the system prompt is unreliable (Sonnet post).
- `/effort <level>` applies from the next request and `/effort status` shows the current level. On an API key or subscription Opus 5.5 keeps its cache across the switch, so one hard step can run higher and drop back; on Bedrock, a Claude apps gateway or Google Cloud's Agent Platform the switch wipes the cached conversation, so switch at a break. On the API, a top-level effort change drops Sonnet 5.5's cache; per-message effort (beta) keeps it.

### Subagents and agent teams
- Set lookup subagents' models on purpose: `model: haiku` or `model: sonnet` in the definition, or `CLAUDE_CODE_SUBAGENT_MODEL` for all of them (a model in the definition wins). With neither, a subagent runs on, and pays for, the main model. Subagents keep file reads out of your context but pay for their own tokens.
- Give small models only work whose mistakes are cheap to catch (finding files, running tests, reading logs), because a misread result leaves the main model paying for a detour. Keep judgment calls and code edits on the main model.
- `opusplan` (Opus plans, Sonnet executes) puts edits on Sonnet, the reverse of the line above; trial it on your own work before making it the default.
- Agent teams are experimental, and every teammate keeps spending until it exits: keep teams small, give each a self-contained task, and stop each teammate once its share is finished.

### Keep the cache warm
- Settle the model, MCP servers and fast mode at session start (and, on a cloud provider or gateway, effort), because the cache reuses only an unchanged prefix. The next request pays for a cache write after an idle gap beyond the lifetime, a model switch, a compaction, connecting or disconnecting an MCP server, the first time fast mode is switched on in a session, or an effort change on a cloud provider or gateway. Editing tool definitions wipes the cache entirely; a system-prompt change invalidates everything after it.
- How long the cache lives in Claude Code: 60 minutes for subscribers until usage credits kick in, then five; five by default for API-key and cloud-provider users. Every hit restarts the clock free.
- Change models at a natural break, after `/compact` or in a new session started from a brief written plan, so the new model's opening turn has less to write. `/model` also changes what new sessions start on, so undo it afterwards.
- Enable fast mode at the start; its first request pays the fast input rate on the entire uncached history.

### Keep the re-sent context small
- `/clear` is free; use it between unrelated tasks.
- `/compact` at a natural pause, naming what must survive (say, the failing test names): while the cache is still live, before a break rather than after, and not just before finishing. A summary may lose the one log line you needed. `/rewind` drops a dead end back to an already-cached prefix; `/autocompact <tokens>` sets the automatic threshold.
- Keep CLAUDE.md short, since every turn re-sends it; the [costs docs](https://code.claude.com/docs/en/costs) suggest under 200 lines. Turn off unused MCP servers with `/mcp` at session start.

### Migrating to a 5.5 model
- Run `/claude-api prompt-audit` over skills and CLAUDE.md (and Claude Platform app code) to find older-model instructions that push Opus 5.5 toward longer output and repeated tool calls, such as forced multi-step routines, scratchpad or verify-twice rules and conflicting instructions. Compare `/usage` on one real task, before and after.
- API code moving off Sonnet 5: swap in `claude-sonnet-5-5` and handle five breaking parameter changes plus one response-shape change. `/claude-api migrate this project to claude-sonnet-5-5` applies the ID swap and parameter changes; the [migration guide](https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide) covers each. First to bite: thinking runs by default, so iterate over content blocks by type, never `content[0].text`; `thinking: {"type": "disabled"}` and forced `tool_choice` now return 400.
- Next, delete Sonnet 5 workarounds (refusal steering, tool-call retry shims, "do not be lazy" lines) and re-run evals before other tuning, then redo the effort sweep. For agentic coding stream with `max_tokens` at the 128,000 ceiling, since thinking counts toward it.

### Measure your own sessions
- After a task run `/usage` (or `/cost`): tokens, a list-price estimate computed locally and a prompt-cache line. On a subscription the dollar figure gauges work done, not a bill.
- Low cache share: look for a cache breaker above; the prompt-cache line tends to name what caused the latest miss. Lots of output for a minor change: effort too high, or retries. Total input many times the conversation's size: too many turns, so read the transcript to find the loop.
- To compare models or levels, run the same real backlog task on each, record turns, output tokens and dollars, and decide only after three or four such tasks. Teams can pull spend from the Claude Code Analytics API (per user) and the Usage and Cost API (per model, cached versus uncached).

## Numbers worth knowing
List prices and illustrations from the posts (2026-09-25 and 2026-09-28); confirm in the [pricing docs](https://platform.claude.com/docs/en/about-claude/pricing).
- Per million tokens: Opus 5.5 $4 input, $20 output, $0.20 cache read; Sonnet 5.5 $2, $10, $0.20; Fable 5.1 $10, $50, $0.25. Fable is 2.5x Opus 5.5 on input and output but 1.25x on reads, so the gap narrows on long cache-heavy runs and widens on output-heavy tasks.
- Opus 5.5 output costs 100x its cache-read price. Cache writes cost 1.25x input (five-minute) or 2x (one-hour); a five-minute write at 120K context is about $0.60 versus about $0.02 per read, and a one-hour write about $0.96.
- Illustrative 40-turn Opus 5.5 task (context growing from 20K to 120K): uncached, 2.8M input tokens come to $11.20; with 90% cache hits $1.62; with 96%, about $0.99. Done in 25 turns: roughly 1.75M tokens, $1.02. One turn's cache read costs about $0.03 at 150K context against $0.004 at 20K.
- If high effort adds about 20K thinking tokens, that is about $0.40 on Opus 5.5, close to a ten-turn retry loop (100K cached context, 10K output): worth it only when it saves a retry.
- Compacting at 150K costs about $0.25 on a warm cache and pays back in about ten turns; on a cold cache the input alone is about $0.75.
- Fast mode: up to 2.5x faster at 2x the price, billed to usage credits on a subscription. Batch API: half price. Plan-mode agent teams: about 7x the tokens of a standard session.
- Sonnet 5.5 keeps Sonnet 5's per-token prices but usually needs fewer tokens, making most work up to 30% cheaper. It caches prompts from 512 tokens (Sonnet 5: 1,024). A 2000×1500 image costs about 2.5x the tokens it did on Haiku 4.5 or Sonnet 4.5/4.6; downscale when detail isn't needed.
- "40% cheaper than Opus 5" is an estimate for typical token-billed work at default settings that counts fewer tokens per task; per token, Opus 5.5 is 20% cheaper on input and output and 60% on cache reads.
- Prompt-audit example (one 44-ticket benchmark, not a forecast): the audit saved about 9% on top of the roughly 18% from swapping Opus 4.8 for Opus 5.5 at low effort.
- Enterprise spend averages about $13 a developer for each active day; 90% of users stay below $30 (current models). Claude Code must be v2.1.280 or newer to run Opus 5.5.

## Pitfalls
- Carrying an effort level over from an older model.
- Letting subagents inherit the main model's price, or moving code edits to a small model to save money.
- Waiting for a third failure before escalating, or staying on the bigger model because `/model` persisted.
- Breaking the cache mid-session with one of the triggers above, or compacting after a break instead of before.
- Asking the system prompt for less thinking instead of lowering effort; reading `content[0].text` on Sonnet 5.5.
- Treating the 40% figure as a per-token cut, or judging a model from one task or a toy example.

## See also
- [effort.md](effort.md), [prompt-caching.md](prompt-caching.md), [long-runs.md](long-runs.md), [context-engineering.md](context-engineering.md), [workflows.md](workflows.md), [evals.md](evals.md)
- If your agent has the built-in `claude-api` skill, use it for current prices and parameters and for its `migrate` and `prompt-audit` commands.
- If your agent has the built-in `update-config` skill, use it to persist a default model or `CLAUDE_CODE_SUBAGENT_MODEL` in settings.
- If your agent has the built-in `workflow-authoring` skill, it covers per-agent model and effort overrides inside a workflow.
