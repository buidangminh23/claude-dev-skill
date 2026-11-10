# Multi-agent teams at scale, and the safety layers around them

Use this note when you design a large team of agents that coordinate through shared infrastructure, or when you decide what safety boundaries a long multi-agent run needs. It is distilled from the post below, in this project's own words. The post describes a toy research experiment on an early Claude Fable 5.2, so treat its numbers as illustrations.

Sources: [Safely scaling multi-agent teams with Claude Fable 5.2](https://claude.dev/blog/safely-scaling-multi-agent-teams-with-fable-5-2/) (2026-11-09)

## Use this when
- A goal is too big for one agent and splits into many parts that can be checked mechanically.
- You must decide how agents share state and avoid duplicating work.
- You are choosing sandboxing and monitoring for agents that run unattended, in parallel.
- You wonder how much structure to impose on a team versus letting it organize itself.

## The experiment in brief (2026-11-09)
- 1,000 agents (1 lead, 999 helpers) reproduced a formal proof of Fermat's Last Theorem in Lean in 28.7 hours, with one-third the output tokens of the September formalization and a proof one-seventh as long. They had no dedicated math platform and no researcher steering them.
- Inputs: 60 target statements, a one-line outline of the classical route, the relevant definitions and 47 lemmas proved earlier. Nothing else about method or team organization.
- Each agent had a shell, a file editor, the Lean toolchain with Mathlib, its own Git branch with merge requests into main, and a shared Postgres database.

## Guidance

### Give a team general tools and a checkable goal
- Use a verifier that accepts or rejects (here, Lean's checker on the main branch) so progress is unambiguous.
- Prefer general primitives to a bespoke platform. Git plus SQL were enough for the agents to design their own coordination. The post notes domain platforms may still add efficiency, such as faster compiles and reuse of prior results.
- Choose SQL for shared state when many agents write at once: transactions handle concurrent writes, it organizes information generally, and Claude knows it. Agents used it to claim tasks, share notes and log finished work.
- Give each agent an isolated sandbox rather than packing agents onto one machine: a single shared machine hit its limits near 100 agents, and over half the 100-agent runs had to be stopped or restarted for memory, disk or CPU.
- Keep units of work independent (one file per statement and proof, each compiling alone) so parallel agents do not edit the same files.

### Impose little structure and let the lead organize
- The only structure was a hierarchy: the lead splits the problem and assigns parts, helpers expect work and ask the lead when a task is unclear.
- In the first 10 minutes the lead created five tables: announce (orders to all), assign (who owns what), notes (open board for claims and progress), subtasks (a to-do list where the first helper to claim a task owns it) and landed (log of finished work).
- It then split helpers into crews of 16 to 17 per statement, named a captain in each who posts a plan and cuts work into subtasks, and told every helper to judge its statement's difficulty first.
- Delegation drifted downward: helpers began writing their own subtasks (by hour 5.6, 73 helpers had written 756, only 16 of them captains) and the lead told free helpers not to wait for it.
- For a piece too large for one agent, let agents split it into a tree of subtasks where each piece may assume those beneath it. The hardest statement grew to 2,418 tasks up to 10 levels deep, letting hundreds of helpers work in parallel.
- The harness sent the lead 19 automatic reminders of the time remaining, each urging it to continue.

### Do not trust early feasibility verdicts
- Agents judged 47 of the 60 statements infeasible within budget, yet most were eventually proved; the lead re-planned after about 27 minutes and 45 minutes of evidence that throughput exceeded the estimates, then moved helpers to the hard statements ("there is no reason to idle").
- The hardest statement's captain estimated under 1% chance of finishing; it was proved at hour 28.4.
- Agents tend to give up on hard problems and misjudge difficulty, so human or lead encouragement at those moments helps. Revisit set-aside work when capacity frees up.

### Layer the safety controls
No single layer is enough. The run combined:
- **Sandboxing:** no network (one pipe to a gateway that relays model, Git and SQL requests); no dedicated messaging tools, so coordination goes only through the database and Git; pushes only to the agent's own branch with a separate job merging into main; shared unprivileged database role with a five-second statement limit and writes refused above 256 MiB; the gateway stamps each request with the agent's identity so one agent cannot pose as another; a kernel built without root-friendly features (loadable modules, kexec, raw memory access, kernel probes) in lockdown mode; commands run as an unprivileged user with `sudo`-like tools removed; agent tools cannot read or change the agent loop itself.
- **Real-time monitoring:** a prompted LLM classifier can block every tool call (shell commands, file edits), looking for sandbox escape, boundary probing, monitor tampering and harmful actions after an escape. In this run, a block on the lead would end the run and a block on a helper removed only that helper; the post's design intent is that a block stops the whole team until a person reviews it. Across more than a million calls none met the blocking bar.
- **Sabotage tests:** in red-team evaluations (including decomposition attacks), monitors that saw chain of thought and inter-agent messages caught all attempts, so they are now used for multi-agent runs. An action-only monitor runs alongside, so persuasive reasoning cannot talk the monitor into allowing a harmful action. This run used only the action-based monitor; the CoT monitor was added shortly after.
- **Offline monitoring:** a later monitor checks the same threat models with extra reach, such as looking up other agents' actions. Run records are kept outside the sandboxes.
- Assume the model could be misaligned when it has not finished pre-release alignment assessment; released models complete that assessment first, which lowers but does not remove the risk.

## Numbers worth knowing
- Earlier September formalization: a researcher plus dozens of agents, 11 days, about 6 billion output tokens, 13 million lines of Lean.
- This run: 28.7 hours; first 10 statements done in about 70 minutes; restarted from its last save near hour 18 with 12 more hours; 54 of 60 statements proved at the end (five alternatives unneeded, one dropped).
- About 750 helpers went to the final hard statement, which needed around nine times the tasks and over double the new code of any other statement.

## Pitfalls
- Packing hundreds of agents on one machine.
- Shared files that agents edit concurrently.
- Treating an early "infeasible" verdict as final.
- Relying on one safety layer, or leaving agents network access and broad privileges.
- Letting agents reach their own harness code or impersonate each other.
- Using only an action monitor against reasoning that may persuade it.

## See also
- [workflows.md](workflows.md) for single-session dynamic workflows and when extra agents pay off; [long-runs.md](long-runs.md) for steering long runs; [model-selection.md](model-selection.md) for lead and worker model mixes.
- Related posts from the article: [improving alignment and security efforts](https://www.anthropic.com/news/improving-alignment-security-efforts).
