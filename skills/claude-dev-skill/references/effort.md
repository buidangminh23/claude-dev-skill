# Choosing an effort level in Claude Code

Use this note to pick an effort level for a task and to judge whether more effort will help when an attempt falls short. It is distilled from the post below in this project's own words; the post has the interactive builds and failure charts.

Sources: [Using Claude Code: Spending your effort](https://claude.dev/blog/spending-your-effort/) (2026-09-25)

## Use this when
- You are starting a task and setting `/effort`: a brainstorm, routine feature work, a bug fix in an existing codebase, or an autonomous build or security review.
- You received a one-line, loosely specified build request.
- You want a quick design direction to react to and refine.
- The work hides many edge cases: sanitizers, storage-engine fixes, numerical solvers, data-preparation choices, performance tuning, security review.
- Attempts keep failing and you must decide whether more effort is the fix, or whether to move to a bigger model instead.
- Nobody will be around to answer clarifying questions during the run.

## Guidance

### Know what effort buys
- Treat effort as your estimate of how much compute the task deserves: Claude handles the task sensibly at every level, and higher levels add verification, edge-case testing and independent judgment. On both Opus 5.5 and Fable 5.1, each step up raised benchmark scores and tokens spent alike.
- Expect more assumptions as effort rises, because a higher level does more of the work and makes more choices for you, while a lower level hands back a starting point quickly and keeps you in the loop.
- Change it per task or mid-conversation with `/effort`. The post says its newest models take effort changes in Claude Code without breaking the prompt cache, and invites trying different levels with Opus 5.5 or Fable 5.1 (as of 2026-09-25); [models-and-cost.md](models-and-cost.md) lists the providers where a change still clears the cache.

### Pick a level per task
| Level | Use it for | Example from the post |
|---|---|---|
| low | quick replies while you stay in the loop | brainstorming, sketching, easy changes |
| medium | most everyday engineering | implementing a new feature |
| high | work where verification matters or edge cases lurk | a bug fix in a brownfield codebase |
| max | hard problems Claude should solve fully on its own | building and verifying an app end to end; hunting vulnerabilities in critical software |

The rule of thumb names four levels; the benchmark runs also used xhigh, which sits between high and max.

### Spend effort where edge cases hide
- Raise effort for tasks with many hidden edge cases and for demanding production work such as security review or performance optimization; the author saw extra effort pay off in domains where verification matters, such as hardware, code review and security. Not every task needs that much.
- Do not count on effort to fix a wrong approach: across Terminal-Bench 3.0, more effort tended to cut failures from missed edge cases but did not rescue attempts where the model chose the wrong approach.
- Prefer higher effort when nobody can answer questions. In a data-analysis task, a user in the loop might have been asked how to prepare the data; without one, the high-effort runs tried two preparations, noticed the results disagreed, investigated and then chose, while low-effort runs took the first plausible option.

### What the extra effort looked like
In the traced runs, passing high-effort attempts did these things that failing low-effort attempts skipped:
- reproduced the bug before editing anything;
- confirmed their new tests failed against partial fixes (low runs never verified that their test could detect the original bug);
- compared results with a reference or brute-force implementation on randomized inputs;
- reviewed their own first draft adversarially and read the source of the parser they relied on;
- ran a standard test suite and wrote a fuzzer;
- timed large inputs instead of only warning that they might be slow.

In the sanitizer and solver traces, low-effort attempts wrote a solution in one pass, tried it on one hand-written page or a few small problems, and stopped.

### Match effort to how settled the request is
- Loose build request: low returns a minimal base to iterate from, max returns Claude's best single attempt. A one-line fitness-tracker request gave a log plus a basic chart at low, richer apps at higher levels, and a heat chart at max.
- Design exploration you will steer: favor low. A redesign of the `/config` menu took about 1 minute at low and 28 minutes at max; every pass had the same core idea, and max came back polished with walkthroughs of several flows.
- Detailed spec: expect little difference between levels. Builds from an interview-derived spec looked alike across levels, with max simplifying a few details.

### A feature loop that splits the levels
1. Hand Claude the spec and have it interview you about missing details.
2. Implement at low.
3. Review that it got the gist; iterate at low as needed.
4. Verify and test at high.

### Effort versus a bigger model
- On Terminal-Bench 3.0, Opus 5.5 at high (58.9%) scored level with Fable 5.1 at max (58.0%) while using about half as many tokens, and Opus 5.5 scored highest of the four models at every setting. That is this post's evidence on effort against switching; the escalation order and the token cost of each step are in [models-and-cost.md](models-and-cost.md).

## Numbers worth knowing
Internal runs with 5 attempts per task (as of 2026-09-25), on tasks the author calls far more ambitious than everyday work. Per-task counts will not match the public leaderboard: Fable 5.1 ran with production safety interventions off, security tasks had no internet, and some worked examples used intermediate settings.
- Terminal-Bench 3.0 pass rate (70 tasks, the same set for each model, minus the 4 GPU tasks): Opus 5.5 36.6% at low, 65.7% at max; Fable 5 plateaued at 43.4% between xhigh and max. The Opus 5.5 runs came about three weeks later, capped at 128k-token responses with no GitHub or PyPI access.
- `html-js-filter` (Fable 5.1): 1/5 at low, 5/5 at xhigh; about 2 minutes per low attempt against about 33 minutes for the traced high-effort run.
- `mvcc-lsm-compaction` (Opus 5.5): 0/5 at low, 4/5 at xhigh; about 1 minute against about 11 minutes per attempt.
- `cli-2ph-simplex` (Opus 5.5): 0/5 at low, 5/5 at high; low attempts stopped near 10k tokens.
- `gsea-proteomics` (Opus 5.5): 0/5 at low, 4/5 at high.

## Pitfalls
- Raising effort when attempts fail on the approach rather than on edge cases.
- Running max for a sketch you meant to iterate on; low reached a reviewable direction in about 1 minute, max took 28.
- Handing a loose request to a high level and getting many unrequested decisions.
- Leaving edge-case-heavy work at low: one pass, one hand-made test, and an unchecked warning about speed.
- Reading these per-task counts as public benchmark results.

## See also
- [models-and-cost.md](models-and-cost.md) for what effort costs in tokens, how effort changes interact with the cache on different providers, and when to switch models.
- [long-runs.md](long-runs.md) for replacing "think hard" lines with an effort change.
- [evals.md](evals.md), [workflows.md](workflows.md)
- If your agent has the built-in `workflow-authoring` skill, its per-agent effort overrides let one workflow build at low and verify at high.
- If your agent has the built-in `claude-api` skill, it explains effort for API callers.
- If your agent has the built-in `update-config` skill, it can persist a default `effortLevel` in settings; max applies to a single session (see [models-and-cost.md](models-and-cost.md)).
