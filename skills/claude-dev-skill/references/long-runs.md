# Briefing and steering long runs

Use this note when you hand a long, mostly unattended task to Claude Code, or write the saved instructions that govern one: how to brief it, when it should stop, how to keep it on track and how to read what it reports. It is distilled from the post below in this project's own words; the post also covers Claude apps, design prompts, safety flags and fast mode.

Sources: [Getting the most out of Opus 5.5 in Claude and Claude Code](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/) (2026-09-22)

## Use this when
- Starting a long Claude Code task such as a migration, a refactor or a run to get a test suite passing.
- Writing or editing CLAUDE.md or other saved instructions, especially after moving to Opus 5.5.
- A run keeps pausing to report, to offer to continue, or to list options that don't block it.
- Auditing, migrating or reviewing many services or modules at once.
- A run will last long enough for older turns to be summarized away.
- A long run has just finished and its report is waiting.
- A diff is about to go to a human reviewer.

## Guidance

### Brief the whole task once
- Put the entire task in one message, with a finish line you can observe (tests green, every endpoint moved, the old client gone) and the condition under which it should stop and ask; then leave it alone. A stated end state is how the model knows it has finished, and Opus 5.5 is stronger than Opus 5 at carrying long, multi-step work through (as of 2026-09-22).
- If you remember a requirement mid-run, type it while Claude works instead of restarting; with longer runs, a restart throws away more.

An example brief written for this note:

```text
Upgrade every caller in src/ from the v2 date helpers to the v3 API.
Finish line: no file imports the v2 helpers, and `pnpm typecheck` and `pnpm test` pass.
Ask me before changing any exported function signature; otherwise keep going.
```

### Drop "think hard" instructions
- Remove lines like "think carefully" or "think step by step" from prompts and saved instructions: Opus 5.5 reasons before every reply and sets the amount itself. In Anthropic's chat-product testing, deleting such a line got replies started earlier without a clear quality drop.
- If a simple question needs a quick reply, tell it to skip straight to the answer; in Claude Code, adjusting effort is the way to get more or less thinking ([effort.md](effort.md)).

### Put a stop policy in CLAUDE.md
- On long tasks Opus 5.5 sometimes halts only to report: a recap proposing a next step it never takes, a question about whether to carry on, or a menu of options none of which block progress. It obeys instructions that spell out which of these pauses you want, so write them down.
- A keep-going policy has three parts: carry on whenever a step needs nothing from you; attach progress notes to the message that carries the next action; stop only when it cannot proceed without you, or before destructive steps such as deleting data, a force-push or changes outside the repository.
- With fewer pauses, keep your own safeguard before risky or irreversible steps: the destructive-action clause is that safeguard, and permission prompts should stay on for destructive commands.
- If a run still asks whether to go on, reply "continue"; add the policy once that becomes a pattern.
- For pair programming, reverse it: ask for a one-line plan up front and a brief wrap-up when it is done. Either style works with Opus 5.5.

An example policy written for this note:

```text
## Stop policy
- If the next step needs nothing from me, do it, and put any status line in the same message.
- Pause only when you are blocked on a decision or information only I can give.
- Always pause first before data deletion, a force-push, or edits to files outside this repository.
```

### Fan large audits out to subagents
- For an audit, migration or review across a big codebase, give each unit (for example each service) its own subagent, have the main agent verify each subagent's evidence before accepting its verdict, and end with one table: unit, affected or not, evidence. Per early testers, Opus 5.5 can coordinate such parallel subagent work on lengthy audits and migrations largely unsupervised.

### Track the checklist in a file
- Ask the run to maintain a checklist file such as `TASKS.md`, ticking items off and appending new ones it finds. Once a long run outgrows the context window, Claude Code condenses earlier turns into a summary; the file survives that and gives a quick view of finished versus open items.
- Read progress from that file, not from the scrollback.

### Read the report in the right order
- When a long run finishes, look first for anything it needs from you (an open decision, a change awaiting approval), then read the rest. Opus 5.5 ends with a plain-language account covering its changes, its findings and its requests of you.
- To fix the report's shape, put the format in CLAUDE.md, such as three closing headings: Blocked on me, Changed, Found.

### Check the result before a person does
- Ask for a review of the branch diff against main that lists only merge-blocking problems, each with its location (file and line), the reason it is wrong and a way to show it failing. One early tester said Opus 5.5 on its lowest effort setting found more bugs, with fewer false alarms, than Opus 5 on high (anecdotal).
- In research or analysis, have it flag whatever it could not confirm and say where it searched; a stated gap is worth reading.

## Pitfalls
- A brief without a finish line or a stop condition, so the run has no stated end state.
- "Think carefully" rituals left in saved instructions after moving to Opus 5.5.
- A keep-going policy without the destructive-action clause, or with permission prompts switched off.
- Restarting a long run to add one requirement.
- Tracking progress in the scrollback, which gets summarized.
- Accepting a subagent's verdict without checking its evidence.
- Asking it to write out its hidden reasoning in the reply: that request falls in a flag category and can be declined, so ask for a short justification instead, such as three sentences on why it picked the approach.
- Missing a model switch mid-run: Opus 5.5 shipped with bio and cyber safeguards at Fable's level (as of 2026-09-22). Searching source code for security holes is permitted, but legitimate work is sometimes flagged, and a flagged message usually hands the session to an older model, where the work carries on; Claude Code shows a notice naming that model. Then `/model` switches back, pressing Esc twice edits the last message to retry, `/config` holds "Switch models when a message is flagged" if you would rather be asked first, and `/feedback` reports a wrong flag.

## See also
- [effort.md](effort.md), [workflows.md](workflows.md), [context-engineering.md](context-engineering.md), [models-and-cost.md](models-and-cost.md)
- If your agent has the built-in `workflow-authoring` skill, it turns "fan out, then check each result's evidence" into a scripted workflow.
- If your agent has the built-in `code-review` skill, use it for the review pass on a diff or pull request.
- If your agent has the built-in `claude-api` skill, its `prompt-audit` command scans CLAUDE.md, rule files and skills for dated instructions such as "think hard" lines.
- If your agent has the built-in `update-config` skill, use it to keep confirmation prompts enabled for destructive commands and to set the flag-switch option.
