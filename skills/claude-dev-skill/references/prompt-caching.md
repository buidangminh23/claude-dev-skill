# Keeping the prompt cache warm

Helps decide how to order an agent's requests, how to change state mid-session, and how to compact, so the prompt cache keeps hitting. Distilled in this project's own words from the post below, which explains how Claude Code's harness is built around caching.

Sources: [Lessons from building Claude Code: Prompt caching is everything](https://claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything/) (2026-04-30)

## Use this when
- Assembling prompts or a tool registry for an agent you are building on the Claude API.
- Cost or latency has jumped and cache misses are a suspect.
- About to put the current time or another changing value into the system prompt, or something there goes stale mid-session: the time, a file the user changed, a mode.
- You want to switch models, or change which tools are available, partway through a long session.
- Adding a mode (such as planning) or a large set of MCP tools to a harness.
- Implementing compaction or any side call that has to read the whole conversation.

## Guidance

### Order the request from stable to volatile
- Design around prefix matching before anything else: a cached prefix runs from the first token of the request to a `cache_control` breakpoint, and a request reuses it only if everything up to that point matches byte for byte, so an edit early in the request discards the cached work for all that follows.
- Order content from most stable to most volatile, so the largest number of requests share the longest prefix. Claude Code's order: (1) static system prompt and tool definitions, shared by every session; (2) CLAUDE.md and memory, shared by sessions in one project; (3) session context such as environment, MCP and output style, shared within a session; (4) the conversation, which grows each turn.
- Keep anything that changes out of the shared prefix; this layout breaks easily. Claude Code broke its own with a detailed timestamp baked into the static system prompt, with tool definitions emitted in a shuffled order, and by updating a tool's parameters (which agents its Agent tool could call).

### Send changes as messages
- When a fact changes (the time, a file the user edited, entering a mode), deliver the new value in the next turn, inside the user message or a tool result, rather than editing the system prompt; that edit causes a miss the user ends up paying for. Claude Code wraps such updates in a `<system-reminder>` tag (as of 2026-04-30).

### Keep the model and the tool set fixed for the session
- Stay on one model per conversation: a cache belongs to a single model, so switching starts the cache over. If part of the work suits another model, give it to a subagent, with the main model writing a hand-off message that describes the task. Claude Code's Explore agents run on Haiku this way (as of 2026-04-30).
- Freeze the tool list for the whole session. Tool definitions are part of the prefix, so a single addition or removal throws away the cached copy of the whole conversation. Trimming the list to what looks useful right now feels natural, yet the post names mid-conversation tool changes as one of the most frequent causes of broken caching.
- Express state changes through tools instead of swapping tool sets. Claude Code's [Plan Mode](https://code.claude.com/docs/en/common-workflows) keeps every tool in every request: EnterPlanMode and ExitPlanMode are tools, and turning the mode on injects a system message with the plan-mode rules (explore without editing, finish by calling ExitPlanMode). A side benefit: the model can call EnterPlanMode by itself when it judges a problem hard, and the cache survives.
- Offer large tool sets through deferral, not removal. Sending the full schema of dozens of MCP tools on every request is costly and dropping them breaks the cache, so Claude Code sends minimal stubs (only the name, flagged `defer_loading: true`) in a fixed order and lets the model load a full schema through tool search once it picks that tool. The stubs never change, so the prefix holds. The API offers this as the [tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool).

### Fork side calls from the parent's prefix
- Run compaction, summarization and skill execution as cache-safe forks: reuse the parent's exact system prompt, tool definitions, and user and system context, keep the parent's messages, and add the new instruction at the end as a user message. Only that instruction is new input.
- Avoid compacting through a fresh request that swaps in a summarizing system prompt and drops the tool definitions: nothing in it matches the cached prefix, so every token of the conversation is billed uncached, and the bill is largest for exactly the long sessions that need compacting.
- Reserve a compaction buffer: room left in the window for the summarize instruction and the summary it produces.
- Prefer the API's built-in [compaction](https://platform.claude.com/docs/en/build-with-claude/compaction#prompt-caching), which Anthropic built from these lessons, to a homemade version.

### Watch the hit rate
- Watch the cache hit rate the way you watch uptime: alert on drops and treat a cache break as an incident. Claude Code's team declares a SEV when the rate falls too low, because a high rate keeps costs down and lets subscription rate limits stay generous.

## Numbers worth knowing
- 100k tokens into an Opus conversation, sending an easy question to Haiku costs more than letting Opus answer, because Haiku's cache would have to be built first (worked example in the post, 2026-04-30; model names as of then).
- In the post's figure, the cache-safe compaction fork pays a tenth of the price for the parent's prefix, which is served from cache, and produces a summary of roughly 20k tokens (2026-04-30).
- A miss rate only a few percentage points higher can move cost and latency a great deal (same post, 2026-04-30).

## Pitfalls
- A fine-grained timestamp inside the static system prompt.
- Tool definitions serialized in a non-deterministic order.
- Changing a tool's parameters, such as the list of agents a delegation tool can reach.
- Swapping in a read-only tool set for a planning mode instead of modeling the mode with tools.
- Dropping idle tools to save tokens, which invalidates the cached prefix for the entire conversation; defer them instead.
- Switching to a cheaper model mid-session for a quick question.
- A summarizing request that swaps in a new system prompt and leaves out the tools, or a window with no space reserved for the summary.

## See also
- [context-engineering.md](context-engineering.md): what belongs in the system prompt, CLAUDE.md, skills and memory in the first place.
- [tool-design.md](tool-design.md): designing the tool set itself.
- [models-and-cost.md](models-and-cost.md): choosing a model and keeping task cost down.
- [long-runs.md](long-runs.md): briefing and steering long runs.
- If your agent has the built-in `claude-api` skill, it covers the API side in more depth (cache breakpoints, checking whether requests hit, compaction, tool search) and is newer than this post, so prefer it for current mechanics.
