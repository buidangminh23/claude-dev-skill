# Designing evals and hillclimbing without fooling yourself

Use this note to judge whether an eval measures what you ship, whether its grader deserves trust, and whether a change found while hillclimbing should be kept. It is distilled, in this project's own words, from the post below.

Sources: [Automating eval design and hillclimbing with Claude](https://claude.dev/blog/automating-eval-design-and-hillclimbing/) (2026-09-28)

## Use this when
- You changed a system prompt, skill, instruction file or tool description and need evidence that the change helped.
- You want a cheaper model or a lower effort level for a feature without losing quality.
- You are building an eval set or grader for an LLM feature, or measuring how reliably a skill triggers.
- Scores move between identical runs, or the grader fails answers that look correct.
- The eval sits near its ceiling, or gains on the eval never show up in production.

## Guidance

### Make the task set worth climbing
- Draw tasks from production, meaning the setting where the feature will actually run. Tasks chosen for being simple to produce or simple to score can leave you measuring a distribution you do not care about.
- Use scale as a sanity check: a more capable model, or more effort, should normally score higher. If it does not, suspect unclear tasks or a grader that is badly calibrated.
- Leave headroom: if even the strongest model at maximum effort scores near 100%, the eval can no longer reliably show whether a change helped, so aim for a top score well below that. The gap must come from hard tasks, not broken ones; a task that fails in every run, however many replicates you add, is probably impossible or ambiguous.
- Hold each task to two tests: would two domain experts agree on its verdict, and does the task text state every criterion the grader checks? Rewrite any task that fails either.
- Cut run-to-run variance at its sources: ambiguous tasks, graders whose verdict changes on identical output, settings such as effort that are not applied every time, and state carried between trials. Give each trial a clean environment, since a leftover file or git history can give away the answer.

### Choose hard cases for a reason you can state
- Do not keep a case only because today's model fails it. Capability is jagged, so such a set records one model's failure pattern instead of what is genuinely hard or worth doing in your application.
- Admit a hard case when someone can say why it is hard. Real failures your application hit, found in production traffic, tickets or bug reports, qualify.
- Do not rely on user traffic alone: people sometimes attempt what they expect to succeed, so a set built purely from traffic can lean easy. Add a few cases where the behavior should not fire; the post's sampling figure includes them.
- Source inputs in this order: production transcripts (after settling retention and sensitive data), bug reports and support tickets, five to ten hand-written cases, then cases synthesized from the codebase. Anchor synthetic cases on a few real examples, show a human every input on a simple review page, and wait for approval.

### Pick the cheapest grader that fits, then try to break it
- Constrained output: grade with code. Compare strings exactly, check membership in a fixed list of labels, validate JSON against a schema, or run a test suite.
- Open-ended output with clear quality criteria: use a second model as judge. Write its rubric as claims it can check one by one rather than a 1-to-5 rating, and have it return reasoning with the score. Choose a judge model other than the one under test.
- Comparing with a baseline: run a blind pairwise check. Present both answers in random order, hide which one is the baseline, and ask the judge to pick the better one.
- Before trusting the grader, ask a human whether they would score any of a handful of graded cases differently, read some scored transcripts yourself (the post names broken scoring as a frequent cause of misconfigured evals), and grade one output twice to see whether the verdict changes.
- Check every run for timeouts, API errors and truncated answers, and count them apart from model results so infrastructure noise does not pass for model variance.
- Before the baseline run, announce its size (cases × repeats × model) and an estimated duration, then report the baseline with a confidence interval. Save what an audit needs: the cases, grader and runner, one JSON record and the complete transcript for every case, and a simple results page that links each score to its transcript.
- A baseline at roughly 95% or higher has little quality headroom left; aim the climb at cost or latency instead.

### Decide what to climb
- Prefer surfaces that are cheap to change and to roll back, such as prompts and skills; open-ended harness edits tend to balloon into big code changes.
- Prefer surfaces whose effect shows up directly in the metric, such as a skill description and that skill's trigger rate.
- State which surfaces the climber may edit. The hillclimb command lets you allow edits to the system prompt, tool descriptions, skills or instruction files, model choice with effort and other API parameters, and harness code.
- Avoid open-ended objectives. Asking for better performance on an eval close to saturation, or for loose rework of the harness, is likely to stall.
- Cost is a strong objective even on a saturated eval: hold quality at parity and lower spend. Check prompt caching, audit the prompt for fit with the chosen model (in the post the audit dropped rules that contradicted each other, a scratchpad step and required tool-call rituals), and revisit model and effort; when a model clears the bar, test the tier below it.
- Give the climber the references it needs to diagnose failures; in the post's skill example it had the documentation and the SDKs.

### Run rounds that cannot fool you
- Fix the goal first (quality, or cost with quality held), then split the cases at random into a train set visible to the climber and a test set hidden from it.
- Before round one, estimate how far the score drifts with no change at all. If that drift is as large as the smallest gain worth acting on, add repetitions or cases before climbing.
- Make one patch per round, based only on the previous round's train transcripts and aimed at the most common failure. Fix that failure at its root (rework the passage responsible, or supply a rule that was missing); a one-line rewording rarely clears the noise.
- Keep the patch only when train and test both improve. Revert it when train rises but test stays flat, a sign of overfitting, and revert any regression.
- Never copy failure content from transcripts into the prompt, and keep reference answers where the model structurally cannot reach them, because models sometimes reward hack by finding the answers.
- Watch for harness changes that only fit the eval: a tool the eval mix needs but production rarely does (the post's example is OCR), paths and commands copied from the eval environment, prompt tuning for the eval's phrasing, one patch per failure read, and in the worst case fetching the reference solution from a public repo. Each raises the eval score without helping production.
- After two or three rounds without progress, or earlier if no single fix could beat the noise, stop editing and sort every remaining train failure by cause. This exposes ambiguous cases, grader bugs, harness errors and run-to-run variance. Feed only genuine failures into later rounds, and add repetitions or cases if noise is what limits you.
- End on the version with the best test score for your goal, compare it with the baseline using confidence intervals, and do not merge a gain that sits inside the noise.

## Numbers worth knowing
- About 95%: the baseline score at which build-eval warns about headroom and suggests a cost or latency goal (claude-api skill, as described on 2026-09-28).
- Two or three rounds without progress: stop patching and sort failures by cause.
- Cost example (2026-09-28; 44 support tickets, 30 searched and 14 held out): the Opus 4.8 baseline at its default high effort scored 74.4% decision accuracy at 4.6¢ per ticket. After the prompt audit, Opus 5.5 at low effort reached 87.8% at 1.9¢, Sonnet 5 at low effort 88.9% at about 1¢, and a better prompt took Sonnet 5 to 98.9% at about 1¢. Those are search-set scores; on the 14 tickets kept out of the search, the final setup scored 90.5% against 78.6% for the original, at about a fifth of the cost. Part of the Opus 5.5 step's saving came from that model's lower per-token prices (see [models-and-cost.md](models-and-cost.md)).

## Pitfalls
- Trusting a grader nobody spot-checked, or letting the model under test act as its own judge.
- Counting a gain seen only on train, or spending rounds on edits too small to measure.
- Editing the prompt or skill yet again when a task never improves after the obvious content gaps are closed; inspect the task and its grader instead. In the post, one grader demanded three or more chained error types although its task text asked for one, so the task was reworded; another grader's instructions contradicted the docs, and a test against the live API confirmed the docs.
- Assuming the model uses whatever a skill contains. Sorting failures in the post's skill example showed the current API shapes were already in the skill, yet Claude kept writing older ones from its training. The fix was an early table in the skill mapping remembered forms to current ones, such as fixed-budget extended thinking (rejected by the API on recent Opus models as of 2026-09-28) to adaptive thinking, plus moving warnings above the examples they qualify.

## See also
- [models-and-cost.md](models-and-cost.md) for choosing a model and effort tier, and current per-token prices, when the goal is cost.
- [effort.md](effort.md), since more effort should raise scores on a healthy eval.
- [skills.md](skills.md) for skill descriptions, a cheap surface whose effect shows directly in the trigger rate.
- [prompt-caching.md](prompt-caching.md), one of the cost drivers to check.
- [performance.md](performance.md) for the same discipline (validate the measure, change one thing, lock in the gain) applied to app speed.
- If your agent has the built-in `claude-api` skill (commands as named on 2026-09-28), `/claude-api build-eval` creates the eval in your repository and stops for you to approve the inputs and the grader (example traces you provide help steer it), and `/claude-api hillclimb` climbs against that eval, keeping a held-out split to catch overfitting. The post says to run `claude update` first because the skill is bundled with Claude Code; its source is in [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/claude-api).
