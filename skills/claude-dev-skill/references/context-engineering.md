# Context engineering for Claude 5-generation models

Helps decide what to keep, cut or relocate in the context Claude receives besides your prompt (system prompt, CLAUDE.md, skills, memory, tool descriptions, references), now that Claude 5-generation models need far less steering. Distilled in this project's own words from the post below.

Sources: [The new rules of context engineering for Claude 5 generation models](https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/) (2026-07-24)

## Use this when
- Writing, reviewing or trimming CLAUDE.md, a SKILL.md, or other standing instructions that load on every request.
- Claude wavers between two instructions from different layers, say "document where it helps" in one file and "no comments" in another.
- Writing tool descriptions or parameter schemas for an MCP server or your own agent.
- Writing the system prompt of your own agent harness.
- Deciding whether a piece of guidance belongs in always-loaded context, a skill, or a reference attached for one task.
- Moving to a newer model generation, or a setup tuned for older models feels heavy and over-specified.
- Choosing which reference material to attach before a large task.

## Guidance

### Prefer judgment to blanket rules
- Swap worst-case rules for a principle Claude can apply case by case. Standing context has to serve requests nobody has seen yet, and a rule written for the worst case misfires on some of them: the user may want documentation their own way, or a tangled stretch of code may really need a long comment block. Claude Code's old prompt told the model to default to no comments, hold docstrings and comment blocks to one short line, and skip planning documents nobody asked for; the current one asks it to blend in with nearby code, using the same amount of commenting, the same naming style and the same idioms.
- Hunt down instructions that contradict each other across layers and delete the guardrails behind them. Each clash costs Claude extra deliberation before it acts, even though it usually still lands on what the user meant. The Claude Code team found such clashes (the system prompt, a skill and the user's own request pulling different ways) by reading transcripts of its own internal use.
- Reserve tight constraints for the few areas that are truly critical (the post says this about skills); elsewhere, let surrounding context and the model's judgment decide.

### Shape interfaces instead of supplying examples
- Build intended use into the design of tools, scripts and files, and make the parameters themselves expressive enough to carry it. On the newest models, worked examples narrow the space Claude explores (observation as of 2026-07-24).
- The post's TodoWrite case: a long description stuffed with usage scenarios and sample calls shrank to one sentence, a `status` enum (`pending`, `in_progress`, `completed`) and one rule allowing a single `in_progress` task at a time. The enum by itself signals how the list is meant to be used; the rule fixes the one behavior that matters.
- State a tool's usage once, inside its own description, and remove the copies from the system prompt. Older models sometimes needed instructions repeated and weighted the tail of the context window more heavily than its start, which is why the duplicates existed.

### Load context only when it is needed
- Move procedures that only some tasks need into skills Claude calls when relevant; Claude Code did this with code review and verification, which used to live in its system prompt.
- Defer tools as well: Claude fetches a deferred tool's full definition through ToolSearch before first use, so extra tools (Claude Code's Task tools, for one) cost no context until Claude reaches for them.
- Split CLAUDE.md and SKILL.md material into a tree of smaller files that Claude opens when a task calls for them. The post calls it a myth that every practice must sit in one master file or Claude will never find it.

### Let memory and references do their part
- Stop using CLAUDE.md as the only place for memory and guidance; Claude Code now also has memory, artifacts and skills for carrying context from one session to the next.
- Rely on auto-memory: Claude Code now records what matters about the work and about you by itself, replacing the old habit of pressing the `#` hotkey to append notes to CLAUDE.md.
- Give rich references instead of thin markdown specs: an HTML artifact, a thorough test suite acting as the spec, a function in another codebase to port, or an entire codebase.
- Prefer references in code form; Claude reads code natively, and code leaves less room for ambiguity than prose. An HTML mockup of a design usually gets better results than a written description or a screenshot.
- Encode taste as rubrics (for example, what good API design looks like) and have verifier agents in a dynamic workflow check the work against them.

### What each layer should still hold
- **System prompt:** the product context, meaning which product Claude runs in and what its job there is. Claude Code users will rarely if ever edit it; if you build your own harness, it deserves a large share of your time.
- **CLAUDE.md:** a brief statement of the repo's purpose, with most of the tokens going to codebase gotchas, such as a convention that all types live in one big file. Skip whatever Claude can see in the file tree or the repo itself, and point to a skill (a verification skill, say) rather than inlining a long procedure.
- **Skills:** light guides that help Claude locate information on demand. They work best when they hold opinions, knowledge or practices peculiar to you, your team or your product. Break long ones into several files.
- **References:** files you @-mention so Claude can consult detail on the current plan: specs, mockups, even whole codebases.

### Auditing an existing setup
1. Start with `/doctor` in Claude Code; the post says these practices are built into it (it also calls the command `claude doctor`) to rightsize skills and CLAUDE.md files (name as of 2026-07-24).
2. Read a handful of real transcripts and note where layers give conflicting directions; delete the guardrails that cause the conflicts.
3. For each blanket rule, ask whether it only guards a worst case that current models handle with judgment; turn it into a principle or drop it.
4. Strip worked examples from tool descriptions, and move tool guidance out of the system prompt into the tool itself.
5. Move content that only some tasks need into skills, files read on demand, or deferred tools.
6. Delete what Claude can discover from the repository, and leave remembering to auto-memory rather than hand-written entries.
7. Repeat the pass after each jump in model generation; guidance that once prevented worst cases can turn into a constraint.

## Numbers worth knowing
- Over 80%: the share of Claude Code's system prompt Anthropic removed for models such as Claude Fable 5 and Claude Opus 5, while its coding evals showed no measurable drop (post of 2026-07-24; the evidence is tied to those models).
- About 9,100 characters: the old TodoWrite description that the one-sentence version replaced (figure in the same post, 2026-07-24).

## Pitfalls
- Equating more instructions with safer behavior: guardrails that once prevented worst cases now overconstrain the model and collide with each other.
- Carrying the cuts over to older models without checking: the guardrails existed because earlier models got things such as comments wrong without them.
- Teaching tool use mainly through examples, which narrows what the model tries.
- Repeating a tool's instructions in the system prompt for emphasis.
- Using CLAUDE.md or a SKILL.md as a store for everything that might ever matter, or for facts visible in the file tree.
- Handing over a prose description or a screenshot of a design where an HTML mockup would serve better.

## See also
- [skills.md](skills.md): writing the skills that take over material moved out of CLAUDE.md.
- [tool-design.md](tool-design.md): tool interfaces and progressive disclosure from the tool designer's side.
- [prompt-caching.md](prompt-caching.md): ordering and stabilizing the assembled context.
- [workflows.md](workflows.md): dynamic workflows, where verifier agents can apply rubrics.
- [html-outputs.md](html-outputs.md): HTML artifacts, which the post recommends as references.
- If your agent has the built-in `claude-api` skill, its prompt-audit material reviews CLAUDE.md, rules files, SKILL.md and tool descriptions for many of the same problems, such as over-specified steps, over-reliance on examples, and repeated or contradictory instructions.
- If your agent has the built-in `skill-creator` skill, it covers progressive disclosure inside a skill folder.
- If your agent has the built-in `workflow-authoring` skill, it covers the verifier agents and judge panels that apply rubrics like these.
