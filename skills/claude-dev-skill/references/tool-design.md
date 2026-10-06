# Designing tools from the model's point of view

Helps decide which tools an agent should have, when a capability deserves its own tool, and when an old tool should go, by judging each tool from the model's side. Distilled in this project's own words from the post below, which retraces how Claude Code's tools evolved.

Sources: [Seeing like an agent: how we design tools in Claude Code](https://claude.dev/blog/seeing-like-an-agent/) (2026-04-10)

## Use this when
- Designing the tool set for an agent harness or MCP server: a single general-purpose tool (bash, code execution) versus many specialized ones.
- The model ignores or misuses a tool, or a text format you asked for keeps coming back malformed.
- Deciding whether a new capability should be a tool, documentation or a skill the model reads, or a subagent.
- Choosing between handing the agent pre-retrieved context (RAG) and letting it search.
- After a model upgrade, when older scaffolding such as checklists and reminders may now hold the model back.
- Designing how an agent asks the user questions.

## Guidance

### Fit tools to what the model can do
- Match tools to what the model can handle today. The post's analogy: for a hard math problem, a person would reach for paper, a calculator or a computer that runs code, depending on which of them they know how to use.
- Find those abilities by observation rather than assumption: study the model's outputs and run experiments.
- Confirm the model picks up a new tool willingly and uses it well; design quality counts for nothing if Claude can't work out how to call the tool.
- Keep the roster of supported models short and close in capability; the right tools depend on capability, and a tool one model needed can hold back a stronger one.

### Give structured interactions their own tool
- When an interaction needs structure, such as questions with answer options rendered as UI, build a dedicated tool for it rather than a text convention. AskUserQuestion exists because answering questions Claude asked in plain text took users longer than it should. One earlier attempt asked Claude for a parseable markdown format instead: it held up most of the time but not reliably, as stray sentences crept in, options went missing, or the format was dropped entirely.
- Keep each tool to one job, even when bolting on a second is the easiest change. The first attempt added a questions array to `ExitPlanTool`, and it confused Claude: one call now had to deliver a plan and question that same plan, leaving it unclear what happens when the answers contradict the plan and whether the tool must be called twice.
- Aim between too loose and too rigid. A markdown convention is unconstrained but hard to turn into UI; a parameter on `ExitPlanTool` arrives too late, once the plan already exists.
- AskUserQuestion, the third design, sits in between. Claude may call it at any time and is nudged toward it in plan mode; the harness shows a modal and pauses the agent loop until the user replies; the result is structured and helps ensure the user gets several options; and the [Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) and skills can use it too. What mattered most was behavior: Claude used it readily and the results were good. The team expects elicitation to keep evolving.

### Retire scaffolding the model has outgrown
- Revisit existing tools whenever models improve; support that kept a weaker model on track can box in a stronger one.
- Watch for two signs, both seen with Claude Code's TodoWrite. First, the model follows its scaffold too literally: TodoWrite gave Claude a [todo list](https://platform.claude.com/docs/en/agent-sdk/todo-tracking) to write up front and tick off, and because Claude still lost track, a reminder of the goal was injected every 5 turns; stronger models then took those reminders as orders to keep to the list even when the plan needed to change. Second, the way work gets done shifts: once models became far more capable with subagents (the post names Opus 4.5), one agent's checklist gave several agents no shared way to coordinate.
- Ask what the tool is for now. TodoWrite's job was keeping one model on track; the job had become letting agents talk to each other, so Claude Code replaced it with Task tools: tasks can depend on other tasks, every subagent sees changes to them, and the model may edit or delete them.

### Let the agent find its own context
- Give the agent search tools instead of pre-retrieving for it; the post calls context-finding tools the most consequential ones Claude Code has built. The first internal version used RAG: snippets retrieved from a vector index of the codebase were inserted before every response. Its speed came with costs: an index to build and set up, a pipeline that could break from one environment to another, and, worst of all, context chosen for Claude rather than by it. Adding a Grep tool reversed that: Claude now looks for files itself and assembles what it needs.
- Expect a capable model to search well. In about a year, Claude's ability to gather its own context grew from very little to nested searches across layers of linked files that locate precisely the context required.
- Use skills to extend search: Agent Skills formalized progressive disclosure, letting a skill file point to further files the model reads recursively, and skills are often used to teach Claude how to query a database or call an API.

### Add capability without adding tools
- Keep the bar for a new tool high, since each addition widens the set of options Claude must choose among. Claude Code had about 20 tools when the post was written, and the team keeps asking whether it needs all of them.
- Keep rarely needed knowledge out of the system prompt, where it causes context rot and pulls attention from the agent's main job. Claude Code's own usage was such a case: Claude couldn't answer questions like how to add an MCP server or what a given slash command does, yet users seldom asked them.
- Try progressive disclosure first, such as a docs link the model loads and searches when needed. If that floods the main context (large chunks of documentation pulled in for an answer that fits in one sentence), hand the lookup to a subagent. The Claude Code Guide works that way: Claude delegates any question about Claude Code to it, it searches the docs in a separate context following detailed instructions on what to look for and extract, and only the answer comes back, leaving the main context clean. It is imperfect (questions about setting Claude up can still confuse it), but it gave Claude a new capability while the tool count stayed the same.

### Deciding: add, disclose or retire
- **Add a tool** (the AskUserQuestion case) when you need reliable structure, a UI surface or composability that text instructions cannot provide, and the model proves willing to call it.
- **Disclose instead** (the Claude Code Guide case) when the need is occasional knowledge: docs or skills the model can search, or a subagent when those would swamp the main context.
- **Retire or replace** (the TodoWrite case) when the model's outputs show a tool constraining it, or when the way agents work has changed, as with several agents sharing one plan.
- Recheck these choices with every model change. The post treats tool design as an art as much as a science, since the answer shifts with the model in use, what the agent is for, and where it runs.

## Numbers worth knowing
- About 20 tools in Claude Code as of 2026-04-10, with a high bar for adding more; treat the count as a dated snapshot.
- A goal reminder every 5 turns: the TodoWrite-era scaffold that later models outgrew (same post, 2026-04-10).

## Pitfalls
- One tool doing two jobs whose outputs can contradict each other.
- A custom text format standing in for structured output.
- Reminders or checklists kept after the model stopped needing them.
- Pre-retrieved context in place of letting the model search.
- Rarely needed reference material parked in the system prompt.
- A new tool for every new need; each extra tool is one more choice for the model.
- Pointing the model straight at large docs, so it drags big chunks into the main context.
- Shipping a tool without checking, in the model's outputs, that it calls the tool and calls it well.

## See also
- [context-engineering.md](context-engineering.md): expressive tool interfaces instead of examples, deferred tool loading, and tool instructions kept in tool descriptions.
- [prompt-caching.md](prompt-caching.md): why the tool set should stay fixed within a session, and modes modeled as tools.
- [skills.md](skills.md): skills as the main vehicle for progressive disclosure.
- API references the post links: [tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [bash tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/bash-tool), [code execution tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool).
- If your agent has the built-in `claude-api` skill, its agent-design material covers bash versus dedicated tools and keeping the fixed context small with tool search and skills.
