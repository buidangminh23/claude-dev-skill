# Dynamic workflows: letting Claude build the harness

Use this note to decide whether a task is worth a dynamic workflow (a script in which Claude starts and coordinates its own subagents) and which patterns to combine. It is distilled from the post below, in this project's own words.

Sources: [A harness for every task: dynamic workflows in Claude Code](https://claude.dev/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code/) (2026-06-02)

## Use this when
- The task splits into many similar units (call sites, failing tests, modules, claims, tickets) and a single pass would likely stop before finishing them all.
- Output must be judged by someone other than its author: fact-checking a draft, checking findings against a rubric, or checking a diff against rules Claude keeps missing even though they are written in `CLAUDE.md`.
- You are hunting a rarely reproducing bug or doing a post-mortem, and one context would tend to favor its own theory.
- A long list needs a qualitative order (bug tickets by severity, resumes for a role, name ideas).
- A backlog contains untrusted text (support tickets, public bug reports) and some items should lead to privileged actions.
- You want options explored against a rubric (design, naming) or a quick eval of a skill you are refining.
- The work is not code at all, such as stress-testing a business plan from several viewpoints or mining months of incident chat; the author finds workflows sometimes pay off even more there.

## Guidance

### Decide whether it pays
- Reserve workflows for complex, high-value work: they often use more tokens than a normal session, sometimes far more, and the post says best practices are still being worked out.
- For everyday coding, first ask whether the job really needs extra compute. A five-reviewer panel is more than most coding tasks call for, and splitting work across specialized parallel agents only makes sense when the gain outweighs the cost of coordinating them.
- Aim workflows where one context that both plans and executes breaks down: very long runs, wide parallel sweeps, rigidly structured jobs and adversarial checks. The longer one context keeps going on a complex task, the more prone it is to three failure modes:
  - agentic laziness: it reports completion after doing only part of the job (the post's example: 35 of 50 security-review items);
  - self-preferential bias: it grades its own work too generously, especially when asked to judge it with a rubric;
  - goal drift: the original goal and its constraints erode over many turns, worst after compaction, because each summary loses detail such as edge-case requirements and "don't do X" instructions.
- Rely on separate subagents, each with a fresh context and one narrow goal, to counter all three.
- Size it to the problem: a "quick workflow", such as a single adversarial check of one assumption, is a legitimate use.

### Know what you are asking for
- Expect Claude to write and run a JavaScript file built on three functions: `agent(prompt, opts)` launches one subagent, `parallel()` runs several at once and waits until all return, and `pipeline()` moves each item through all of the stages. Ordinary JavaScript (`JSON`, `Math`, `Array`) handles the data between steps.
- Know the per-agent knobs from the post's diagram: only the prompt is mandatory; in `opts`, `schema` forces validated JSON output, `model` selects `haiku`, `sonnet` or `opus`, `isolation` selects `worktree` or `remote`, and `agentType` picks a subagent type.
- Count on resume: if a run is cut off (the user interrupts it, or the terminal closes), resuming the session picks the workflow up where it stopped.
- Get one by asking Claude for a workflow directly; adding the keyword `ultracode` makes sure Claude Code builds one.
- Unlike a static harness scripted with `claude -p` or the Agent SDK, which must handle every edge case and so stays generic, a dynamic workflow is written for this one task; the post credits Claude Opus 4.8 with making that practical (as of 2026-06-02).

### Compose from six patterns
- **Classify-and-act**: a classifier agent decides what kind of task this is and routes it to the matching agent or behavior; a classifier can also run at the end to decide what the output should be.
- **Fan-out-and-synthesize**: break the job into many sub-steps with one agent each, so every step gets a clean context and none contaminates another; synthesis acts as a barrier, combining their structured results only after every branch has returned.
- **Adversarial verification**: pair each working agent with a separate agent that tests that work against a rubric or explicit criteria.
- **Generate-and-filter**: produce a wide set of candidates, cut them down by rubric or by testing, merge duplicates, and keep only the best tested ones.
- **Tournament**: rather than dividing the work, let several agents attempt the whole task in different ways, then have a judging agent compare results in pairs until one wins.
- **Loop until done**: when nobody knows how much work there is, keep launching agents and stop only when a condition holds (no fresh findings, a clean log) instead of fixing the number of rounds in advance.

### Recipes from the post
- **Migration or refactor**: enumerate the units of change, give each fix its own subagent working in its own worktree, have a second agent review each fix adversarially, then merge. Ask the agents to avoid resource-hungry commands so many can run in parallel on one machine. (Per the post, Bun's port from Zig to Rust used workflows.)
- **Deep research**: search in parallel, fetch the sources, check their claims adversarially, and write a cited report; Claude Code's `/deep-research` skill works this way. The same shape suits a status report compiled from Slack or an in-depth study of how a feature works in a codebase.
- **Deep verification**: one agent pulls out every factual claim, a dedicated checker investigates each claim, and an optional auditor behind each checker judges whether its source is good.
- **Sorting a big list**: do not ask one prompt to rank a thousand-plus rows, because the quality drops and the rows will not fit in context. Use a bracket of pairwise comparisons (comparing two items is more reliable than scoring one in isolation) or rank buckets in parallel and merge them. Because deterministic code keeps the bracket and each comparison runs in a fresh agent, no context ever holds more than the running order.
- **Rule adherence**: give each rule its own verifier with a clean context, then let a skeptic agent reread every flag to remove false positives. Run it in reverse too: comb recent sessions and review threads for corrections you find yourself repeating, group them using parallel agents, test each candidate rule adversarially (would it have prevented an actual mistake?), and write only the survivors into `CLAUDE.md`.
- **Root cause**: let separate agents build hypotheses from disjoint evidence (one on logs, one on files, one on data), then put each hypothesis in front of verifiers and refuters. The same structure works away from code, for a sales drop or a failed data pipeline.
- **Triage**: classify each item, skip what is already tracked, then act, either attempting a fix or handing the item to a human. Quarantine untrusted input: the agents that read public content get read-only tools and pass on only structured summaries, and a separate privileged agent acts on those summaries. Pair it with `/loop` to keep it running.
- **Taste and quick evals**: generate many options and give a reviewer agent an explicit rubric; stop when the rubric is satisfied, or order and select the options by tournament. If no rubric exists yet, have Claude interview the user for one (one example prompt names the AskUserQuestion tool for this interview). For a lightweight eval, run agents in separate worktrees, then let comparison agents grade the results on a rubric, for instance while refining a skill.
- **Model routing**: a classifier agent first measures the task (for example, how many files the module contains and how the codebase is shaped), then hands it to Sonnet or Opus; this can pay off when the work needs many tool calls.

### Prompt, cap, reuse
- Write a detailed prompt that names the patterns you want; the post says detailed prompting gives the best workflows.
- For workflows you will repeat (triage, research, verification), add `/loop` so they rerun on a schedule and `/goal` so they have a hard finish line.
- State a token budget in the prompt, for example "use 10k tokens", to cap what the run spends.
- To reuse a run, save it from the workflow panel with the `s` key, then check it into `~/.claude/workflows` or ship the `.js` file in a skill folder referenced from `SKILL.md`. Tell Claude to treat a shipped workflow as a template to adapt, not a script to replay verbatim. (Key, folder and budget wording are Claude Code UI details as of 2026-06-02.)

## Numbers worth knowing
- Token scale from a panel screenshot in the post (2026-06-02): `review-changes` ran 14 agents, 482k tokens, 6m 12s; `deep-research` ran 22 agents, 1.1M tokens, 11m 3s.
- 1,000+ rows: the post's example of a list too large to rank in a single prompt.

## Pitfalls
- Spending a workflow on a routine edit that one session would finish.
- Letting the agent that produced a result also judge it.
- Hard-coding how many passes open-ended work gets, instead of looping to a stop condition.
- Scoring a huge list inside one context instead of comparing pairs.
- Giving agents that read untrusted text the power to act.
- Many parallel agents all running heavy commands and exhausting the machine.
- Rule checks with no skeptic pass, which leave too many false positives.
- Shipping a saved workflow in a skill as a fixed script rather than a template.

## See also
- [models-and-cost.md](models-and-cost.md) for choosing the model each agent runs on, and [effort.md](effort.md) for effort levels.
- [long-runs.md](long-runs.md) for briefing and steering long runs; [evals.md](evals.md) for eval design beyond a quick worktree comparison; [skills.md](skills.md) for packaging a workflow template inside a skill.
- Claude Code docs linked from the post: [workflows](https://code.claude.com/docs/en/workflows), [subagents](https://code.claude.com/docs/en/sub-agents).
- If your agent has the built-in `workflow-authoring` skill, load it for the script API and authoring details; this note covers when a workflow pays and which patterns fit.
- If your agent has the built-in `deep-research` skill, it already implements the research recipe; if it has the built-in `loop` skill, use it for the recurring runs.
- If your agent has the built-in `code-review` skill, its `ultra` level already runs a multi-agent review.
