# Model selection across Haiku, Sonnet, Opus and Fable

Use this note to choose a starting model and effort, to decide when to escalate, and to combine models. It is distilled from the post below, in this project's own words. It is newer than [models-and-cost.md](models-and-cost.md), which still discusses Fable 5.1; prefer this note on conflicts.

Sources: [Which Claude model should you build with? Fable, Opus, Sonnet, or Haiku](https://claude.dev/blog/which-claude-model-should-you-build-with/) (2026-11-09)

## Use this when
- Choosing `/model`, or `model:` for a subagent.
- A model underperforms and you must pick between a check, more effort and a larger model.
- A system routes steps across several models, or a request moves between models.

## Guidance

### Starting points (2026-11-09)
| Task | Model | Effort |
|---|---|---|
| Daily engineering and debugging, features over several PRs, computer use, image-heavy loops, or undecided | Opus 5.5 | `medium`, then `high` |
| Tagging, routing, bulk extraction | Haiku 5.5 | `medium` |
| Lookup subagents (search files, scan logs, summarize) | Haiku 5.5 or Sonnet 5.5 | default |
| Live chat | Sonnet 5.5 (Haiku 5.5 for simple volume chat) | `low` or `medium` |
| Bug fixes, spec-driven features, recurring investigation, review or drafting agents | Sonnet 5.5 | `medium`, `high` if harder |
| Routine documents, decks, spreadsheets | Sonnet 5.5; Opus 5.5 for intricate financial models or very large source sets | `high` on the API, `medium` in Claude Code |
| Large refactors and migrations, architecture, coordinating many subagents, deep research, quantitative science | Fable 5.2 | `medium`, then `high` |

- Opus 5.5 at `medium` is the usual starting point; per token it is half the price of Fable 5.2.
- A well-defined spec does not by itself make Sonnet enough: migrations and optimizations may still need Opus 5.5, or Fable 5.2 for large ones.
- Fable 5.2 is also the step up when Opus 5.5 at `high` is not enough, and for long runs nobody watches.
- Adjust effort before the model. It adds thinking, tool calls and self-checking at the price of latency, but cannot supply missing knowledge. Past `high`, test the next model at lower effort instead.

### When a model is not enough, in order
1. Give it a way to verify itself: a test, a build, a script hitting the endpoint.
2. Raise effort one level.
3. Move up one model, at lower effort than the smaller one used.
- With automated outcome checks, run everything at `low` and re-run only failures at `high`. On a SWE-bench Pro subset that passed about 97% at about $0.17 per task, versus 95.3% at $0.29 with everything at `high`.
- Fast mode (API) exists for Opus 5.5 and Fable 5.2 only, at premium pricing.

### Judge by cost per finished task
- Terminal-Bench 3.0: Fable 5.1 at `max` scored 58.0%; Opus 5.5 at `high` scored 58.9% on half the tokens. FrontierCode 2.0: Fable 5.2 at `high` (45.3%) roughly equalled Opus 5.5 at `max` (45.5%) for about half the cost per task. So try Fable 5.2 before taking Opus 5.5 beyond `high`.
- SWE-bench Pro, Opus 5.5 relative to `high`: `medium` about 2.5 points lower at about 70% of cost; `low` about 8 points lower at about a third; `xhigh` about 1.4 points higher at 2.5x cost.
- Include your hardest tasks when pricing; in one 20-problem benchmark, two problems accounted for 43% of spend.
- Small models suit bulk work whose output you can check, and struggle with long agentic loops.
- The larger the main model, the more a lean context pays; let cheap subagents do the bulky reading.

### Mixing models
- **Switch at a natural break.** A cache is tied to the model that wrote it, so the first turn on another model pays a write for the whole history. Use `/compact` or start a new session from a short plan; on the API start with a summary.
- **Thinking blocks.** A model can read only certain others' blocks. Opus 5.5 handles those from Sonnet 5.5 and Haiku 5.5, Sonnet 5.5 handles Haiku 5.5, and Fable 5.2 handles all three lower models. Unreadable blocks are dropped without error, so the new model lacks that reasoning; any move away from Fable 5.2 drops it. See the [preserved thinking docs](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).
- **Subagents.** Set `model: haiku` or `model: sonnet` in the definition, or `CLAUDE_CODE_SUBAGENT_MODEL` for the default. Hand them work where errors are cheap to notice; keep edits and judgment on the main model, since a misread search sends it to the wrong file.
- The built-in Explore subagent now follows your session model (capped at Opus on the API). For cheap exploration define your own `Explore` subagent with `model: haiku`. `ANTHROPIC_DEFAULT_HAIKU_MODEL` pins the `haiku` alias, which on the Anthropic API now means Haiku 5.5 (Claude Code v2.1.293 or later) but on Bedrock, Google Cloud, Microsoft Foundry and Claude Platform on AWS still means Haiku 4.5.
- `opusplan` puts edits on Sonnet, opposite to the rule above; measure before defaulting to it.
- **Advisor tool (beta).** A cheap executor can ask a stronger advisor for help, and most tokens bill at the executor's rate. Measure how often it asks, and check allowed pairings first (Fable 5.2 as executor allows just Fable 5.2 or Mythos 5.2 as advisor). The platform guide saw no clear win over the executor alone; Opus 5.5 at `high` plus a Fable 5.1 advisor gained 1.7 points for about 2.1x the cost.
- **Lead plus workers** for work beyond one context: on a defect search across about 22 million tokens of source, an Opus 5.5 lead with up to 25 Sonnet 5.5 workers cost about a third less than Opus 5.5 alone with a similar score. Skip it for dependent chains or work that fits in one context. See [multiagent orchestration](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration) and [workflows.md](workflows.md).

### Compatibility checks before migrating
- Fable 5.2: the API returns 400 if earlier content changed before one of its thinking blocks, unless you opt in to dropping that thinking. Claude Code, the Agent SDK and Managed Agents handle it; custom code should keep history append-only.
- Opus 5.5 and Fable 5.2 always think, and disabling thinking errors. Sonnet 5.5 thinks by default (`between_tools` limits it). Haiku 5.5 can switch it off at `high` or lower. Read content by `type`.
- Forcing a tool with `tool_choice` `any` or `tool` gives a 400 on Sonnet 5.5, Opus 5.5 and Fable 5.2; use `auto`, `strict: true` tools and prompt wording.
- Computer use on these models relies on the `computer_toolset_20260801` toolset (Claude API, and Google Cloud's Google-managed Claude models).
- Haiku 4.5 to 5.5: replace `budget_tokens` with effort, drop non-default `temperature`, `top_p`, `top_k`, and never end `messages` on an assistant turn (all 400).
- Safety classifiers on Opus 5.5, Sonnet 5.5 and Fable 5.2 mostly flag cybersecurity and biology; Claude Code may re-run flagged requests on Opus 4.8 (cyber) or Opus 5 (biology) and says so in the transcript.
- Targeting several models: write requests for the strictest one so tiers can swap without code changes, and pick models in code when the rule is simple.

### Measure on your own work
1. Collect real tasks, each with a pass/fail check.
2. Try every candidate at two or three efforts, one session per run, and read cost from `usage` in the responses.
3. Chart score versus spend; a multi-model design earns its place only by beating all single-model points.
4. Shadow the winner on a slice of live traffic. For a fast look, run one backlog task on two models with `/model` and compare `/usage`.

## Numbers worth knowing
API list prices per million tokens, 2026-11-09; confirm in the docs.
- Haiku 5.5: $0.10 in, $0.50 out up to 100K-token prompts, $0.50 and $2.50 above; cache reads $0.01 and $0.05. Its long tier is still a quarter of Sonnet 5.5's price.
- Sonnet 5.5 $2 / $10, reads $0.10. Opus 5.5 $4 / $20, reads $0.20. Fable 5.2 $8 / $40, reads $0.20.
- All four: 1M context, 128K output. Default API effort: Haiku 5.5 and Opus 5.5 `medium`; Sonnet 5.5 and Fable 5.2 `high`.
- Fable 5.2 output is up to 30% faster than Fable 5.1; Sonnet 5.5 is 30% faster than Sonnet 5.
- Mythos 5.2 is available only through verification programs.

## Pitfalls
- Picking Sonnet only because a spec exists.
- Going beyond `high` before testing a larger model.
- Using effort to cover for a missing check.
- Changing model mid-conversation with no compaction.
- Sending forced tool choice, disabled thinking or edited history to models that refuse them.
- Deciding from average tasks or one run.

## See also
- [models-and-cost.md](models-and-cost.md), [effort.md](effort.md), [prompt-caching.md](prompt-caching.md), [workflows.md](workflows.md), [evals.md](evals.md)
- [Model configuration](https://code.claude.com/docs/en/model-config), [subagents](https://code.claude.com/docs/en/sub-agents), [advisor tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool)
- If your agent has the built-in `claude-api` skill, use it for current prices and parameters.
