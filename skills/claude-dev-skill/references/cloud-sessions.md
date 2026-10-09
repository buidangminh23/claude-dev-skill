# Running Claude Code in cloud sessions

Use this note when deciding whether a task belongs in a Claude Code cloud session, writing tasks for one, preparing the environment it runs in, or untangling a GitHub connection that fails. It is distilled from the post below in this project's own words; the post also has the walkthrough screenshots, plan-specific credit offers and a Team and Enterprise checklist.

Sources: [Claude Code in the cloud: a field guide to cloud sessions](https://claude.dev/blog/claude-code-in-the-cloud/) (2026-10-06)

## Use this when
- Several small, unrelated tasks are waiting on one repository.
- A task needs repeated or long-running proof, such as running a test suite hundreds of times.
- You want a task to continue while the laptop is closed, or to follow it from a phone.
- Code you have not read (a contributor's pull request, an install script, a fresh clone) has to be run.
- A first cloud session fails to see a repository, or fails to authenticate.

## Guidance

### What a cloud session is
- Each task gets its own fresh virtual machine, with the repository cloned onto a new branch and the environment's setup done. Sessions therefore cannot collide on files or ports, and the work ends as a branch that can become a pull request. See [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web).
- Sessions can be started from claude.ai/code, the mobile app, the Desktop app, a terminal (`claude --cloud`) and Slack, and followed from the browser, the phone or Desktop.
- Cloud sessions are included in Pro, Max, Team and Enterprise plans with no separate compute charge, but they draw on the same usage limits, so five parallel sessions use the limits about five times as fast as one. Some organizations need an owner to switch the feature on. A claude.ai login is mandatory, and on Enterprise the seat must be premium or Chat + Claude Code.
- The repository's Claude config (`CLAUDE.md`, rules, skills, agents, commands) travels with the clone. Personal `~/.claude` does not.
- Your real GitHub token never enters the VM. A proxy keeps it, and the session gets a temporary credential limited to pushing its own branch.
- Idle VMs are reclaimed. Reopening restores the conversation on a fresh VM, so commit anything that matters as you go.

### Local or cloud
- Choose the cloud for parallel backlog items, long verification loops, work that must survive a closed laptop and untrusted code.
- Stay local when the task needs something only your machine has (real local data, a VPN-only service, a GPU, a simulator, hardware), when you want a tight visual loop in your own browser, or when the organization uses Zero Data Retention, which turns cloud sessions off.
- Approval modes differ: cloud sessions run in Auto, Accept edits or Plan, while per-command approval is a local option.
- Remote control (session stays on your machine, steered remotely) and self-hosted environments (beta for Team and Enterprise, cloud sessions on your own infrastructure with private-network reach) sit between the two. See [self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments).

### Write tasks as self-contained tickets
- State what is wrong, what done looks like and the command that proves it. In the post's test, a prompt demanding at least 30 consecutive green suite runs got 40 runs and zero failures.
- Ask for heavy proof, since the VM's CPU is not yours: 200 suite runs, a bisect across 50 commits, the slow integration tier, or starting the app and calling each endpoint.
- Push local commits before starting, because the VM clones from GitHub, not from your disk.
- Split parallel tasks along file boundaries. Sessions cannot see each other: one session in the post hit a flaky test that another was fixing, reported it and left it alone. Merge branches in a sensible order, then send the next session a follow-up asking it to rebase.
- Read the session's summary before its diff; it says what was run and what stayed red.
- Review changes in the diff view. Inline comments go out together with your next message, and **Create PR** can produce a regular PR, a draft, or GitHub's compose page. You may type while Claude is busy; those messages wait in a queue and can be retracted.
- On Team and Enterprise, a session can be made visible to the Team so reviewers see how the change came about; commits from the cloud include a `Claude-Session` trailer pointing at the transcript.
- Larger efforts can use a project (public beta for Pro and Max), where a coordinator conversation starts and tracks sessions. See [projects](https://code.claude.com/docs/en/claude-projects), which can start up to 200 new threads a day.

### Workflows that suit the cloud
- **Plan locally, build remotely, finish in the terminal.** Agree the plan in plan mode, commit and push it, start a cloud session on that plan, then pull the session back with teleport (`claude --teleport`, or `/teleport`) once it is done. Teleport needs a clean working tree and a pushed branch; it fetches the branch and loads the conversation into the terminal. `/tp` and `/tasks` then `t` reach the same picker, and the Desktop app's **Open in** menu sends a local session up instead.
- **CI and review upkeep.** With the Claude GitHub App installed, Auto-fix (CI bar in claude.ai/code, `/autofix-pr` on the PR branch, or pasting the PR URL) lets a session push clear fixes for failing checks and review comments. It asks about anything ambiguous or architectural. Its review-thread replies appear under your GitHub username with a Claude Code label, and they may set off comment-driven tooling such as Atlantis. Merge conflicts with the base branch never reach it, so request a rebase yourself.
- **Routines** (research preview) are saved prompt, repositories, connectors and environment, fired by one of three triggers: a schedule (no more often than hourly), a call to the routine's own HTTP endpoint, or a GitHub event like a PR opening or a release. No approval prompts appear during a run, and pushes default to `claude/`-prefixed branches, so scope routines narrowly. Routines also have hourly caps.
- **Follow-ups and bookmarks.** `claude -p "<message>" --cloud <session-id>` queues a follow-up into a running session from any logged-in machine, including CI. A `claude.ai/code?prompt=...&repositories=<owner>/<repo>` URL opens a prefilled session.
- **Untrusted code.** The disposable VM holds no SSH keys, cloud CLI logins or browser profile. Setting network access to None is the tightest option, yet calls to the Anthropic API continue (so data can still leave) and the session can still push its own branch. Trusted permits package registries, GitHub and the large cloud SDK hosts. Hostnames of outbound traffic are logged by a proxy.
- **Phone check-ins.** Questions about the code are a good fit; the post's example found an edge-of-window bug by running code, with no files changed.

### Give the session ways to check its own work
- Start with the Default environment (Trusted network, no variables, no setup script); it covers most JavaScript, Python, Go and Rust repositories.
- A setup script runs as root before Claude Code starts, must exit 0, and should finish in about five minutes so the environment gets cached. The cache rebuilds when the script or allowed hosts change, and about every seven days.
- Put project install steps in a SessionStart hook in the repository's `.claude/settings.json` so they behave the same locally and in the cloud; `CLAUDE_CODE_REMOTE` marks cloud-only steps.
- Cached snapshots hold files, not running processes. Start databases and services per session.
- Choose the narrowest network level that works: Custom for a private registry, Full only for open internet.
- Environment variables are visible to everyone using the environment, so keep secrets out. On Pro and Max, environment API credentials attach keys to requests for named hosts outside the VM.
- Document how to run integration tests in `CLAUDE.md`; the session cannot read your personal config.
- Long test loops are cheap inside a single command. Per the post, a command waits 2 minutes by default (10 maximum) before moving to the background, where it may run up to 30 more; the variables `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` adjust those limits. See [cloud environments](https://code.claude.com/docs/en/cloud-environments).
- Sizing for big repositories: roughly 4 vCPUs, 16 GB memory, 30 GB disk. Do heavy installs once in the setup script.

### Connect GitHub
- Two separate permissions are involved: signing in with GitHub (who you are) and installing the Claude GitHub App on the account or organization that owns the repositories (which private repositories are visible). Public repositories need only the first.
- Auto-fix, GitHub-triggered routines and projects need the App.
- Browser path (recommended): connect at claude.ai/connect-github, install the App, and for an organization expect an owner to approve it.
- Terminal path: `/web-setup` sends your `gh` token to your Claude account. Sessions then reach whatever that token can, without the App. On Team and Enterprise, an owner enables Quick setup first.
- One-off path: `claude --cloud` in a repository with no GitHub remote uploads a bundle instead of cloning; pushing back requires push access through your GitHub connection.
- Missing private repository: usually the App is not installed on the owning account or organization, or its repository access excludes it.
- Missing organization repositories right after connecting: SAML single sign-on authorization was skipped; authorize each organization, then reconnect.
- "Must be an owner" error: a pending App permission request, an IP allow list or SAML blocked the membership check; an owner resolves it in the organization's settings.
- Every session fails to authenticate: the Claude organization uses IP allowlisting, and support has to exempt Anthropic-hosted services.
- More: [troubleshooting](https://code.claude.com/docs/en/claude-code-on-the-web#troubleshooting).

## Pitfalls
- Starting a cloud session before pushing, then wondering why recent commits are missing.
- Vague tasks with no proof command, so the session hands back unverified changes.
- Parallel tasks that overlap in the same files, or that depend on each other's results.
- Leaving important work uncommitted in a long session whose VM may be reclaimed.
- Putting secrets in shared environment variables, or opening network access wider than the task needs.
- Assuming GitLab or Bitbucket repositories can be pushed to: a bundle upload works, pushing back does not. GitHub Enterprise Server is supported on Team and Enterprise.
- Assuming cloud sessions work with a Console API key or a third-party provider; they need a claude.ai account.
- Relying on personal skills, MCP servers or commands that live only in `~/.claude`; commit them under `.claude/`, add project MCP servers to `.mcp.json`, and note commands in `CLAUDE.md`.

## See also
- [long-runs.md](long-runs.md), [workflows.md](workflows.md), [skills.md](skills.md)
- If your agent has the built-in `schedule` skill, it manages routines that run on a cron schedule.
