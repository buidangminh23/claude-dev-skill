# Verifying agent work with evidence

Use this note to pick the tests and checks that let an agent prove its own changes, and to keep those checks honest. It is distilled, in this project's own words, from the post below.

Sources: [How the Claude Code team thinks about verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/) (2026-11-16)

## Use this when
- You want many agents in parallel without reading every diff.
- You are choosing test types for agent-written code, or planning a behavior-preserving migration.
- Tests are flaky or slow and the agent reruns or skips them.
- You are adding a commit gate, a REVIEW.md or a reliability checklist, or a check missed a bug.

## Guidance

### Why it comes first
- Without verification you can supervise one or two agents; with it, dozens. A separate grader scoring against a rubric lifted success by up to 10 points in the post's structured-file test (2026-11-16).
- Tests, benchmarks and specs are cheap to request, and once written they run as plain software.
- When the agent keeps failing one check, add a hook or a firmer CLAUDE.md rule.
- Flaky tests teach the agent to rerun; slow ones push it to batch. Run heavy tests before committing. Never skip, sleep or retry a flaky test: find the cause, or delete it and note why.

### Three test types
1. **End to end** (first choice): real user flows, hard to fool, clear done criterion, and failures come with a step trace and screenshot. Unit tests can pass while the feature breaks. Give the agent a skill that boots, drives and inspects the real app; a user-view feature map doubles as rubric.
2. **Property tests**: state what must never fail and let fast-check, Hypothesis or proptest generate inputs. Good properties: round trips, invariants, idempotency, equivalence with a naive version. Generated edge cases avoid the author's blind spots, which helps rewrites whose spec has drifted.
3. **Differential tests**: run old and new systems on identical random or sampled production inputs; differences are bugs or approved changes. Normalize noise such as whitespace and list approved differences.

### Run the change
- Running the app end to end beats the suite: a browser extension for web, a mobile MCP, computer use for desktop, or the local service for backends.
- Record how to start and drive the app in a skill called `verify` under `.claude/skills/` near the code, and stress-test it, since it is your smoke harness.

### Decide where people look
- Claude fixes failing checks and stops for a person after three failed rounds.
- Code owners write checks for their code; a check that summons a reviewer should say why.
- A reliability checklist (39 items in the post) gives each item a diff-visible trigger, a check and the incident behind it; Claude runs only matching items, usually 3 to 10.
- Tune one reviewer with a REVIEW.md instead of stacking a costlier second one, and point later rounds at earlier findings.

### Keep checks out of the change's reach
- Code Review reads REVIEW.md from the base branch, never from the PR ([docs](https://code.claude.com/docs/en/code-review-customize)); gating rules must live where the change cannot edit them.
- A pass on an outdated commit means nothing. Run tests, build and linter before opening a PR, enforced by a [hook](https://code.claude.com/docs/en/hooks) or a [/goal](https://code.claude.com/docs/en/goal).

### Roll a gate out in observe mode
- Stamp each commit with how it was verified, including "none".
- A gate blocking commits lacking `/code-review` or `/verify` has off, observe and enforce modes; observe logs would-be blocks so false positives surface first. In enforce mode a message may explain a skip, and after two blocks in a session the next commit passes.

### Grade the checks
- Track reverts, maintainer rejections and a size-matched clean set. For a formal evaluation (see [code-review.md](code-review.md), [evals.md](evals.md)): rebuild the repo at review time, give a one-sentence answer key, score only findings naming that bug, use stable changes as control, and keep tuning and test sets apart.
- Score recall separately for raw findings, post-verification and final review; also tag Important, Nit or Pre-existing ([docs](https://code.claude.com/docs/en/code-review-pull-requests)). Stop raising recall once gains are only eval-fitting.

### Turn misses into rules
- Patterns seen in at least two PRs and visible in a diff become candidates; three agents try to disprove each and a human approves it. Or replay three bug finders on an incident PR: two finds means detectable; a miss on a small diff deserves a REVIEW.md rule.
- Prune routinely; suites and rules only grow otherwise.

## Pitfalls
- Unit tests alone; changes editing their own gate; enforce mode with no observe period; one blended eval score.

## See also
- [code-review.md](code-review.md), [evals.md](evals.md), [long-runs.md](long-runs.md), [skills.md](skills.md)
