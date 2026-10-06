# Writing skills that agents actually use

Helps decide what a skill should contain, how to lay out its folder and description so it triggers and stays useful, and how to share and measure skills across a team. Distilled in this project's own words from the post below.

Sources: [Lessons from building Claude Code: How we use skills](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/) (2026-06-03)

## Use this when
- Creating a skill, or deciding whether some guidance should become one.
- A skill fires too rarely or on the wrong requests.
- A SKILL.md has grown long and needs splitting into references, scripts or assets.
- Building a verification or runbook skill.
- A skill needs per-user setup, a record of earlier runs, or safety guards for risky sessions.
- Sharing skills with a team: checking them into a repo versus running a plugin marketplace.
- Working out which skills actually get used.

## Guidance

### Give each skill one job
- Fit every skill into a single category. Anthropic's internal skills fall into nine, and a skill that spreads across several confuses the agent. Treat the nine as a checklist for finding gaps in your own library, not as a closed set.

| Category | What it holds |
|---|---|
| Library and API reference | Correct use of a library, CLI or SDK, internal or a common one Claude sometimes gets wrong: reference snippets plus gotchas. |
| Product verification | How to prove the code works, often by driving Playwright, tmux or a similar tool. |
| Data fetching and analysis | Access to data and monitoring stacks: credentialed fetch helpers, dashboard IDs, standard ways to pull data. |
| Business process and team automation | A repetitive workflow as one command; saving each run's results to a log helps later runs stay consistent. |
| Code scaffolding and templates | Framework boilerplate, most useful when part of the spec is prose that code alone can't capture. |
| Code quality and review | Org standards and review aids, often backed by deterministic scripts; can run from hooks or a GitHub Action. |
| CI/CD and deployment | Fetching, pushing and deploying code, sometimes drawing on other skills for data. |
| Runbooks | Start from a symptom (alert, error signature, chat thread), investigate across several tools, finish with a structured report. |
| Infrastructure operations | Routine maintenance, including destructive steps that need guardrails. |

- Leave out what Claude already does by default; a knowledge skill earns its context by pulling Claude away from its habits. The post's example: Anthropic's [frontend design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md), which steers Claude away from stock choices such as purple gradients and the Inter typeface.
- Invest heavily in verification skills; no other kind of skill improved output quality as measurably inside Anthropic. Back them with scripts, for example a video of the result showing what Claude actually exercised, or scripted state checks after every step.

### Lay out the folder
- Treat the skill as a folder, not a markdown file: next to the instructions it can carry scripts, data files, assets and config that Claude finds and works with. Claude Code skills also take configuration options, hook registration among them ([frontmatter reference](https://code.claude.com/docs/en/skills#frontmatter-reference)).
- Use the file system for progressive disclosure: list the skill's files in SKILL.md and say when each one applies (a table mapping symptoms to files works well); Claude reads each file when it becomes relevant. Typical splits: detailed signatures and usage examples in `references/api.md`, a template for the final output in `assets/`.
- Bundle code: ship a few helper functions whose docstrings record the data's traps, and Claude will assemble them into one-off analysis scripts instead of rewriting boilerplate.
- Plan for setup: keep values the user must supply (the post's case is which Slack channel a standup skill posts to) in a `config.json` inside the skill directory; when they are missing, Claude asks for them and saves the answers. For multiple-choice prompts, have Claude use the AskUserQuestion tool.
- Give the skill memory where past runs matter; an append-only log, JSON files and a SQLite database all work. A standup skill that appends each post to a log can look back on its next run and see what is new since the previous day. `${CLAUDE_PLUGIN_DATA}` points to a stable directory for such data ([persistent data directory docs](https://code.claude.com/docs/en/plugins-reference#persistent-data-directory); Claude Code mechanism as of 2026-06-03).

### Write the body
- Make the Gotchas section the core of the skill, built from failures Claude actually runs into and extended over time; no other part of a skill carries as much signal. The post's sample entries each pair a trap with what to do about it: an append-only table where the wanted row has the highest version, one value named differently in two services, a staging endpoint that reports success although the real work failed.
- Describe the outcome you want and the boundaries it must respect, then leave the route to Claude. Claude follows a skill's wording closely, and a reusable skill meets many different situations, so a fixed recipe keeps it from adapting.

### Write the description for the model
- Write the frontmatter description as a trigger condition, not a summary for people: Claude Code gathers every skill's description into one list at session start, and Claude matches each request against that list to pick a skill.
- Include a few trigger phrases: the post's improved `babysit-pr` description is one short line about watching a PR through to merge, followed by the triggers "babysit", "watch CI" and "make sure this lands".

### Scope opinionated behavior with on-demand hooks
- Attach strict guards to a skill as on-demand hooks that start when the skill is invoked and stop when the session ends (a Claude Code skill feature as of 2026-06-03); always on, they would get in the way of everyday work. Examples: `/careful`, meant for production work, uses a PreToolUse matcher on Bash to block `rm -rf`, `DROP TABLE`, force-push and `kubectl delete`; `/freeze` refuses Edit and Write outside one directory, so you can add logging while debugging without Claude "fixing" unrelated code.

### Share, compose and measure
- Check skills into the repo under `./.claude/skills` while a small team works in a few repos. Past that, run an internal plugin marketplace ([docs](https://code.claude.com/docs/en/plugin-marketplaces)): each committed skill takes up some model context, whereas a marketplace lets each person choose what to install and can ship a setup flow.
- Curate without a gatekeeper: at Anthropic a new skill goes into a sandbox folder on GitHub and gets shared in chat; once its owner judges it has traction, a PR moves it into the marketplace.
- To make one skill rely on another, name it in the instructions; if it is installed, Claude will call it. Skills and marketplaces had no native dependency management as of 2026-06-03.
- Measure with a PreToolUse hook that records every skill invocation; the log reveals favorites and skills that fire less than expected.
- Ship early and keep extending: a few lines and one gotcha make a fine first version, and the post credits additions made after each new edge case for most of Anthropic's best skills.

## Numbers worth knowing
- About one engineer-week: what the post says can be worth spending just to make verification skills excellent (2026-06-03).

## Pitfalls
- Treating a skill as a lone markdown file, without the scripts, data and templates that make it dependable.
- Restating defaults: context spent, behavior unchanged.
- One skill trying to cover several categories, which confuses the agent.
- A description written as a feature summary ("a comprehensive tool for ...") that never tells the model when to fire.
- Step-by-step recipes in a reusable skill, such as a six-step list of git commands for a cherry-pick where three sentences on the target, the conflict policy and what to report on failure would do.
- Guard hooks that are always on.
- Checking every skill into every repo as the team grows.
- Expecting skills to declare dependencies on each other.

## See also
- [context-engineering.md](context-engineering.md): where skills sit next to CLAUDE.md, memory and references.
- [tool-design.md](tool-design.md): progressive disclosure and the AskUserQuestion tool from the tool designer's side.
- The post points to the [skills documentation](https://code.claude.com/docs/en/skills) and to example skills in [anthropics/skills](https://github.com/anthropics/skills).
- If your agent has the built-in `skill-creator` skill, use it for the mechanics: folder layout, progressive disclosure, and testing whether the description triggers.
- If your agent has the built-in `claude-api` skill, its prompt-audit material flags common skill problems such as a verbose SKILL.md and over-prescribed steps.
- If your agent has the built-in `update-config` skill, it can add the settings-level PreToolUse hook that logs skill usage.
