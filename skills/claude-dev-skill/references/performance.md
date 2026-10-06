# Making software faster with Claude

Use this note to plan performance work with Claude: what to measure, how to make a number safe to optimize, how to ship many small speedups without incidents, and which decisions stay with people. It is distilled, in this project's own words, from the post below.

Sources: [How we made claude.ai 3x faster in two weeks](https://claude.dev/blog/how-we-made-claude-ai-faster/) (2026-09-23)

## Use this when
- An app feels slow and you must decide where to start and what "faster" means.
- You want Claude to keep optimizing for hours or overnight without waiting on production data.
- Wall-clock benchmarks are too noisy to compare attempts or to gate CI.
- People can see jank or stutter that existing metrics rate as fine.
- A risky UI or performance change needs a flag and a staged rollout.
- A speedup you already shipped must survive a codebase that changes fast.

## Guidance

### Choose targets from real usage
- Have Claude mine usage data (the post used the Datadog MCP server) for the few journeys that carry most activity. The post's four (opening the app, starting a conversation, reopening one, sending a message) covered 95% of use and became thirteen measurements across web, desktop and products.
- Define every measurement with the same boundaries so the numbers compare: a user interaction starts the clock, a rendered result stops it, and client and server time are split.
- Turn the plan into numbers: list hand-picked projects, one journey each (about twenty in the post), get a millisecond estimate from Claude for every project, and use the summed estimates as targets.
- Keep capacity free for projects Claude discovers and proposes itself. When targets fall, ask Claude what remains unexplored and where the largest opportunity now sits (the post asked for unconventional ideas too), then set new targets.
- Give Claude a standing brief that makes it own the area, not a single task: guard deploys against regressions, check telemetry for accuracy and completeness, keep dashboards curated, fix what it observes (easy wins included) without being asked, pitch new projects, and report to the team.

### Turn each target into a number Claude can climb in the lab
- Treat a new measurement as the start of optimizing, not groundwork: Claude climbs as soon as it has a number to beat, so the most useful thing people can add is another thing to measure.
- Build lab measurements so Claude can validate prototypes without waiting for a deploy and field data, and keep working unattended, even overnight.
- Prefer deterministic counts over timings:
  - Pure JavaScript hot paths: count instructions (Valgrind's `Ir`) with Node started as `node --predictable`, and diff against a baseline committed to the repo. One run yields a stable figure, so no statistics are needed.
  - Browser code, where Chromium offers no instruction counting: count React commits for each interaction, function calls via V8's precise coverage, how often layout and style are recalculated, and DOM mutations.
- Explore each candidate metric in a separate thread.
- Admit a benchmark only when Claude can move it in the lab, CI can enforce it, and Claude has shown on real hot paths that lowering it cuts wall-clock time. Drop any proxy that is flaky or does not track user latency, so Claude never optimizes what users cannot feel.
- Protect each proven count with a ratchet: the guarded path gets a ceiling, CI fails any PR that exceeds it, and a daily job tightens the ceiling to each new low.

### Run one narrow loop per thread
Give each thread a single benchmark or journey as its whole scope, and keep Claude's search for gains inside it. Then cycle:
1. A person reports a slow moment, often attaching a screenshot or screen recording.
2. Claude traces the code path and reproduces the slowness in a benchmark, reusing one or writing one.
3. After a lab win, Claude opens PRs (often several) split by risk and review effort, with anything users could notice behind a flag.
4. After release, Claude monitors the rollout and checks field numbers per build and platform.
5. Faster: ratchet the benchmark. Not faster: switch the flag off and iterate.
6. Move on to the next bottleneck in that journey.

Let threads keep going past their first request, and let Claude open new threads for leads it finds in side investigations or nightly jobs. To scale, open more threads once the loop works in one; the post kept over 150 going at once, some producing 50 to 100 PRs.

### Look where existing metrics are blind
- When people can see a problem that a standard metric rates as fine, go to the browser API underneath. Sidebar rows that visibly jumped scored only about 0.008 CLS per shift, against a 0.1 "good" line, so Claude built telemetry on the Layout Instability API that labels every `layout-shift` entry with the page region its `sources` fall in and with the load phase (before first paint, after the page becomes typeable).
- Make the visible bug a failing test, and prove the fix across repeated runs. The integration test delayed the sidebar's data past first paint and broke on movement in any named region: red on main 20 times out of 20, green on the PR 20 out of 20.
- Ship the telemetry and let field data set the work. In the field, 31% of web page loads shifted content after the page had become usable, without user input; Claude fixed the top named causes as a batch, then went after the next batch.
- Count and trace widely; every census in the post found a hidden cost, such as 6,900 hooks and 900 store subscriptions re-rendering per keystroke, a `:root:has()` selector costing 24 ms per DOM change, and a stray `location.reload()` causing about 500,000 unseen reloads a day.
- Sweep for CPU hitches. In the post, one em dash or curly quote in a reply made the page freeze for about a second while a finished code block was highlighted: any non-Latin-1 character makes V8 hold the whole string in UTF-16, which sends every highlighting regex down a slower two-byte path. Copying each code block into a fresh one-byte string before highlighting cut the first block's time by 65%, to 0.35 s, in the lab.
- Test smoothness with deterministic frame stepping: headless Chromium ticks at 60 Hz by default, but DevTools begin-frame control steps it at exactly 120 Hz, so every frame passes or fails an 8.33 ms budget instead of yielding a noisy timing. Fixes found this way: memoize finished blocks (each streamed chunk had cost time proportional to message length), tokenize still-growing code fences in a worker, and reveal tables cell by cell. The rig then ran nightly under Claude's watch.

### Ship fast without incidents
- Install guardrails before the pace rises: unit tests exist before any optimization lands, every PR gets automated review plus approval from at least one human, and anything that might cause a user-visible problem ships behind a feature flag meant to be short-lived.
- Manage flags as a set; the post created nearly 200 in two weeks. Coordinate rollout and cleanup in one thread, label each flag a kill switch or a ramp, and delete it once that is safe.
- Give brittle wins dedicated guards, since speedups erode when the codebase moves fast. Guards on the static composer (HTML a user can type into before React takes over) included: markup produced by rendering the real component in jsdom, with a test against drift; a keystroke test that keeps typing while React replaces the static copy and fails if any key goes missing or out of order; a comparison with the React render at 14 viewport sizes that must agree within 1 px; and field telemetry that reports handoff movement to 0.1 px, with Claude opening a thread for anything nonzero.
- Roll risky changes out in stages, employees first, then 1% of users, then everyone, because no lab catches everything. During the composer's internal stage a teammate's screen recording showed a shift no metric caught; Claude traced it to Chrome prerendering the page at the shorter height of a managed browser's new-tab page, which headless tests cannot reproduce. The layout now holds steady through the resize, and a test simulates prerendering.

### Divide the work: Claude executes, people steer
- Claude did the execution: locating bottlenecks, building benchmarks and telemetry, opening PRs, watching every deploy, reading field data and retiring flags. About one PR in three added telemetry or guardrails.
- People kept three decisions: what the goals were, which tradeoffs to accept, and whether each change merged (every one needed approval). They also contributed ideas Claude then built out: asking whether instruction counts could replace wall-clock timing, going straight to the Layout Instability API, and pushing the frame rig from 60 to 120 Hz. Steering took three forms:
  - Ambition: Claude's default caution shows up as findings filed as tickets, hedged feasibility calls and padded estimates. With guardrails in place, tell it to act now, and remind it that a met target is not the end.
  - Taste: every thread needs one named person in charge. Claude brings that person before/after screenshots or recordings of anything users would perceive (should a table fill cell by cell or wait for complete rows?), and they make the call.
  - Direction: decide order and user impact, merge threads that collide, close threads at diminishing returns, and turn down complexity the gain does not justify (a 900-line PR was declined because 2 ms per send was not worth maintaining a build plugin).

## Numbers worth knowing
- Result (p75 of real users, 2026-08-13 vs 2026-08-27): about 3x faster, a 3.1x geometric mean over 13 measurements. A fresh claude.ai load became typeable in 0.55 s instead of 3.1 s. Over 3,000 merged changes caused no rollback and no incident that reached customers.
- Proxy proof: on two hot paths, 48% and 31% fewer instructions (Valgrind, `node --predictable`) gave 78% and 44% less wall-clock time (same benchmark, plain node, JIT warmed up).
- Setup (as of 2026-09-23): Claude Tag (beta) with an internal research model that the authors place roughly level with Opus 5.5.

## Pitfalls
- Climbing a proxy nobody has shown to track wall-clock time.
- Gating CI on milliseconds, which are too noisy for a gate.
- Trusting an aggregate score such as CLS when people can see the problem.
- Treating the first targets as the finish line; in the post, 12 of 13 were met by day three.
- Letting Claude's default caution set the scope when guardrails could absorb more risk.
- Leaving a proven win without a ratchet or a dedicated guard.
- Assuming a headless rig behaves like a real browser, with its UI and prerendering.

## See also
- [evals.md](evals.md) for the same habit applied to LLM quality: validate the measure, change one thing, keep it only if it holds.
- [long-runs.md](long-runs.md) for briefing and steering long unattended runs.
- If your agent has the built-in `loop` skill, it can run the recurring part, such as a nightly regression watch; it does not teach benchmark design.
- If your agent has the built-in `run` skill, it can drive the app to capture before-and-after screenshots for the owner; it does not measure performance.
