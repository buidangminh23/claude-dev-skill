# Reviewing agent-written code without a human reading every diff

Use this note to design or tune a review process for a repo where agents open many pull requests: what to automate, where people stay, how to scale approvals by risk, and how to keep an AI reviewer useful instead of noisy. It is distilled, in this project's own words, from the post below.

Sources: [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/) (2026-10-15)

## Use this when
- Agents produce more pull requests than people can read line by line.
- You are adding an AI reviewer, a security review, or risk-based approval rules to a repo.
- The reviewer's comments are noisy, repeat themselves, or keep an agent author looping for rounds.
- You need to decide which changes may merge without a person and which always need one.
- Someone asks how teammates keep learning the codebase when machines do most of the reading.

## Guidance

### Reframe the goal
- Review does two jobs: catching issues before they ship, and spreading understanding of the code. Treat "did a person read it?" as a weak stand-in for "what could go wrong here, and which check is best placed to catch it?"
- Aim at the least human time per change that does not raise reverts or incidents. Count time spent fixing breakage as well as time spent reviewing, otherwise you only move the cost.
- Track it with approvals per PR (median and 95th percentile), comment counts, and wait time on a person. Treat revert and incident rates as the guardrail.
- Run review continuously, like a spellcheck, so most changes were already reviewed and fixed by Claude at least once before a person is asked.
- Post figures (2026-10-15): from June to September, merged PRs to Claude Code more than doubled while the share reverted fell by over 40 percent. The team's stated target is that most PRs merge with at most one human involved, possibly the author.

### Layer the checks, expecting each to have holes
1. **Verify before the PR.** Give Claude something it can run (tests, a build, a screenshot to compare with the design) and have it show output rather than claim success. Then use a subagent with fresh context to review the diff. Many engineers also run skills that hunt bugs, simplify the diff and check behavior end to end. The post follows its [best-practices guide](https://code.claude.com/docs/en/best-practices) here.
2. **AI review on every PR.** The reviewer compares the diff with the whole repo and the PR's stated purpose, asking whether the change fits and what else it might break; for a bug fix it hunts the root cause. See [Code Review for Claude Code](https://code.claude.com/docs/en/code-review); `/code-review` is a lighter local variant.
3. **Security review that can block.** No merge while a bug or security finding is open. Authors fix it or close the thread with a short reason (this is how false positives are cleared); a later commit that fixes the issue clears it automatically. `/security-review` or the open-source security review GitHub Action gives you a similar setup.
4. **Blocking automated checks.** Lint, type checks, cross-platform tests and a build. The PR template asks for how it was tested and how to undo it; Claude can draft the answers, yet whoever requested the change vouches for them.
5. **Human approval scaled by risk** (next section).
6. **Merge queue, flags, staged release.** The queue re-runs all checks against main with the change applied, so two separately green PRs cannot combine into a broken main. Ship new behavior behind a flag to internal users first, and use a `latest` channel ahead of `stable`.
7. **Fast detection and rollback.** Flags switch off without deploying, an on-call rotates weekly, and incident reviews ask which earlier layer ought to have caught it. Spotting a bad merge still depends on people and dashboards; the team wants circuit breakers that tighten approvals when revert numbers climb, but has none yet.

### Make AI findings trustworthy
- Run several agents looking for bugs in parallel, then have a separate group vote on each finding; post it only if enough agree it is real. Drop findings that are purely style, diagnostics or cleanup. The team A/B tested these filters on its own PRs before keeping them.
- Present findings as inline comments sorted by severity and tagged Important, Nit or Pre-existing, so an old bug is not blamed on the author.
- Require every finding to be answered: fix it, or resolve the thread with a reason. An agent can pick up fixes overnight.
- When the reviewer keeps flagging the same thing, fix the source: the skill, a lint rule, or an instruction file.
  - `CLAUDE.md`: stack, conventions, goals and non-goals. Every review loads it, so keep it short and link out. The reviewer also flags code that breaks it and edits that leave it stale.
  - `REVIEW.md`, owned by code owners: what matters in their area. Test that the reviewer really follows it. Good ones are short, define what failure means in that repo (docs: "it lies"; config: "it misroutes"), cap nits, list paths to skip, demand a file and line as evidence rather than a guess from a name, and ask for a summary that opens with a count and says so when nothing needs fixing.
- Admins set Quick, Standard or Deep for each repo; choose Deep where a single escaped bug outweighs review time. After the research preview launched, the share of internal PRs with substantive comments went from 16% to 54%. Large PRs (over 1,000 lines) mostly get findings; small ones mostly pass clean.

### Scale human approval by risk
| Risk | Examples (post, 2026-10-15) | People |
|---|---|---|
| Low | Documentation, wording, internal-only features, additive flagged changes | No person needed when automated review and security checks pass |
| Medium | Ordinary product changes; sensitive areas such as caching, the auto-updater, system prompts | One |
| High | Highest-risk code and a short list of always-two paths | Two |

- **The change sets the tier, not the author.** One classifier picks the tier from the change; a second asks whether this change needs another person even though its tier says otherwise. Owner-listed sensitive paths and any CI workflow file always need a person.
- **Lighter paths only for trusted authors** on the repo's list, mostly its owning team. Everyone else needs a second approver.
- **A bot's approval never fills a human slot.** Automated review may clear a low-risk change only.
- **The person directing an agent counts as a required reviewer** of that agent's PR, as if they typed it.
- **An approval covers one commit.** When commits arrive that the system cannot vouch for (an agent push, a hand-resolved merge), approve again.

### Keep the reviewer improving
- **Turn incidents into an eval.** Collect PRs that caused incidents, with their fixes and reverts, have engineers who know the code confirm each bug and its location, and score the reviewer on that set daily. Keep a change to the reviewer only if the score rises. See [evals.md](evals.md).
- **Measure noise from reactions.** Sort comments by what the author did: fixed, called it wrong, called it intentional, or judged it unimportant. Also run the reviewer on known-clean PRs and count reports that would push someone into a harmful change. Their written priority: real bugs first, fewer review rounds second.
- Noise costs more with an agent author: it will fix a nit, which adds a commit and another review round.
- **Make review converge.** One CLI PR went through over fifty review-and-fix rounds overnight. Blame data showed about 59% of what the reviewer kept flagging was code present since its first pass, so extra rounds were finding old bugs a few at a time. Changes adopted:
  - After three rounds, ask the author to step back and reconsider the approach.
  - Re-review only the new diff after the first few passes.
  - Flag the class of bug so every instance is fixed, not one line.
  - Never repeat a finding already posted.
  - Track rounds-to-pass next to recall. Reported result: PRs passing after one round went from 65% to 78%, PRs needing five or more rounds from 8.9% to 1.5%, mean reviews to pass from 2.08 to 1.32.
- Run review agents nightly over existing code to find old bugs early.

### Where people stay in the loop
- Whether to build something at all (direction, taste, scope), including changes from outside the owning team.
- Code where mistakes are costly: billing, the auto-updater, CI workflows.
- Architecture that others will copy.
- Reading the evidence: test output, the command and its result, a screenshot, the reviewer's findings. If you cannot say what the checks would miss, ask for a real review instead of a quick approval.
- Owning the outcome: a person is accountable for each shipped change, whoever typed it.

### Share understanding another way
- Do not rely on skimming trivial diffs. When someone needs to understand a part of the code, have Claude write an explainer for exactly that slice, or build a small visual artifact that teaches it the way that person learns.
- Work in open channels so others can see work in progress and steer it. Suggest a different direction early in the thread, rather than blocking a finished PR.

### "You land it, you own it"
- The author of a small or medium change usually fixes what it breaks. This stays healthy when changes are small, everything is reversible in minutes, blast radius sets the checking bar, regressions surface fast through telemetry and internal use, and incident reviews examine the system rather than assign blame.

## Adoption checklist (from the post)
- **Before the PR:** short `CLAUDE.md` listing runnable checks, hooks for formatters and linters, local `/code-review` and `/security-review` or a fresh-context subagent, and a `REVIEW.md` that absorbs repeated comments.
- **Every PR:** required CI; "Testing", "Risk" and "How to revert" in the template; an AI reviewer piloted on one repo and tuned for a few weeks before widening; automated security review; all threads resolved before merge; effort matched to risk; capped rounds with diff-only re-review.
- **Approval:** write down risk tiers derived from the change, start strict and relax with evidence; reserve light paths for trusted authors; enforce person-only sign-off through CODEOWNERS and branch protection for authentication, billing, CI, release pipelines and installers; never let a bot approval stand in for a required human; dismiss approvals when new commits arrive.
- **Merge and after:** merge queue, flags, internal use first, staged releases, one-step rollback; an incident-based eval rescored whenever prompts, tools or model change; human time measured with reverts and incidents as guardrails.
- When a review misses something, ask what the model lacked and put the fix in `CLAUDE.md`, a skill or a new check.

## Pitfalls
- Loosening approvals before you can see reverts and incidents; the post lists circuit breakers as still missing.
- Letting agent author and agent reviewer iterate with no round cap.
- Tuning the reviewer for recall alone and flooding authors with non-bugs.
- Treating an approval as valid after new unvetted commits.

## See also
- [evals.md](evals.md) for building the incident-based eval and trusting its grader.
- [skills.md](skills.md) and [context-engineering.md](context-engineering.md) for keeping `CLAUDE.md` and review skills short and useful.
- [long-runs.md](long-runs.md) for evidence-based acceptance of unattended work.
