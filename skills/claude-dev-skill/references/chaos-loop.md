# Hardening a service with an agent-run chaos loop

Use this note when Claude should break a service on staging before launch and fix what fails, or when you choose a stack an agent can measure. It is distilled, in this project's own words, from the post below.

Sources: [Using a "chaos loop" to harden the Claude Docs launch: 60 server errors across billions of requests](https://claude.dev/blog/chaos-loop-claude-docs-launch/) (2026-11-17)

## Use this when
- A launch is coming and you lack real traffic to test with.
- You want a long session to find and fix reliability or memory problems on staging.
- You are picking a runtime or dependencies and want agent-measured numbers to be trustworthy.

## Guidance

### Reported results (2026-11-17)
- Claude Docs shipped on September 16, 2026: over 4.6 million docs by September 22, 60 server errors over 2 billion requests, no rollback, about 50 memory-optimized pods, 629 prod rollouts in September.
- Seven of ten rehearsed failures occurred in prod; fixes sat behind runtime flags. The author used an internal model roughly comparable to Claude Fable 5.2.

### Shape of the loop
- A Claude Code session acts as coordinator: choose a scenario, run the harness, read telemetry, propose a fix, ship to staging, repeat. Most work went to subagents (about 11 at once in the busiest week, 30 at peak); the post says one agent also works if token burn is high.
- Staging mirrored production with over a million synthetic docs a day, plus paranoid scenarios: 10M creations in a day, 22,000 simultaneous reconnects, a hot doc with hundreds of viewers, a server killed mid-load, a stalled database.
- Each pass saturates one feature, reads telemetry through an observability MCP server, and returns a short menu of options with a recommendation. Reversible fixes are deployed to staging and retested.
- Name beforehand the decisions that need approval (schema, key layout, storage format): Claude stops there with options and a recommendation.
- State invariants up front: docs open almost instantly, and an acknowledged edit must survive. They held across many compactions.

### Make the system legible
- Ask for the outcome (survives launch), not individual fixes; the agent needs to pull signals and rerun a harness itself.
- Let Claude add missing telemetry every iteration. Query metrics reported name plus rows scanned versus returned, exposing bad queries.
- Expect wrong first guesses: a 3 GB doc led to shrinking one cache, but the memory sat in a dependency's cache, so the change was dropped. Profiling then found per-keystroke copies; copy-on-write took the doc to about 180 MB in three days and the pod estimate from over 500 to about 50.
- Choose stacks where each number traces to your code. Expecting garbage collection to add noise, the team wrote Rust (no Go bake-off) and vendored its few dependencies to read and measure them.

### Small-scale recipe
Give Claude telemetry access (usually an MCP server), have it write a load script at ten times real traffic that breaks things (kill an instance, stall the database, deploy mid-spike) and keep fixing failures, with invariants written down and options required for hard-to-undo steps.

### Cost (list price, November 2026)
- About $125,000 at Fable 5.2 list price for the launch push; the author thinks half would suffice now. A small-stack two-week push is estimated, unrun, at $3,000 to $10,000.

## Pitfalls
- No invariants or approval list; noisy runtimes; trusting a first hypothesis without rerunning the harness.

## See also
- [long-runs.md](long-runs.md), [performance.md](performance.md), [verification.md](verification.md), [workflows.md](workflows.md) (goal drift)
