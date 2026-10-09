# Building scheduled agent automations

Use this note when designing an unattended agent that runs on a schedule, reads several sources, and posts a short digest somewhere (a daily brief is the post's example), or when such an agent has started missing items, repeating itself or going quiet. It is distilled from the post below in this project's own words; the post also has the full agent and deployment files and a walkthrough that the built-in `claude-api` skill can run.

Sources: [Building effective agent automations](https://claude.dev/blog/building-effective-agent-automations/) (2026-10-08)

## Use this when
- An agent should wake on a cron schedule, collect what changed since its last run, and tell a person only what matters.
- A scheduled agent lost access to a source and nobody noticed.
- Briefs repeat items, drop items, name the wrong day or mark finished work as pending.
- You need to decide what an unattended run may read, write and spend.

## Guidance

### Shape of the reference design
- The post's reference implementation uses Claude Managed Agents (beta) and reads Slack channels and GitHub pull requests, then posts one dated message to a Slack channel. Code: [daily-brief quickstart](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/daily-brief). Platform background: [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview).
- Six parts: sources, one destination, the agent (model, tools, run steps), a schedule, memory, and guardrails.
- The agent is a versioned configuration (model, system prompt, tools). A separate deployment names the agent, its environment and first message, and holds the schedule, vault, memory stores and budget. Each firing starts a fresh session on the platform, so nothing runs on your machine. See [scheduled deployments](https://platform.claude.com/docs/en/managed-agents/scheduled-deployments).
- Configuration lives in files in the repository (agent, deployment, environment, memory stores, vault); a CLI step turns them into platform resources and records their IDs in a lock file. Check the post and platform docs for the current commands rather than copying them from a note.

### Sources
- Give the agent its own scoped credentials, held in a vault. The agent refers to them, but real values stay outside the sandbox: MCP calls go through a proxy that matches the vault credential to the server URL, and shell calls see only a placeholder variable that the platform swaps for the real token on requests to hosts you allow. See [vaults](https://platform.claude.com/docs/en/managed-agents/vaults).
- Restrict each credential to the hosts it needs (the post's Slack example allows only `slack.com`).
- Read from a bookmark, not a fixed window like "the last 24 hours". A late run would leave a gap and an early run would repeat items. At the end of a run, write the timestamp of the newest item read per source to a `bookmarks.json`; the next run starts there.
- Keep bookmarks in a memory store, which is a folder of text files mounted under `/mnt/memory/` and kept between runs. The agent uses ordinary file tools on it. See [memory](https://platform.claude.com/docs/en/managed-agents/memory).
- A failed read must not look like a quiet day. If an MCP server is down or a token expired, the run still starts without that server's tools and the agent may report "nothing new". Instruct it, on a failed source, to leave that source's bookmark alone, write the brief from the remaining sources, and end with one line naming what it could not read.

### Destination
- Post to one place. The built-in bash tool runs without approval by default, so the agent can post with an HTTP call once the host is on the environment's allowlist. See [environments](https://platform.claude.com/docs/en/managed-agents/environments).
- Confirm the post before recording it. Recording a post that never landed moves bookmarks past unreported items; posting again out of doubt sends readers the same brief twice.
- Three rules for this: first look in the channel's recent messages for today's title and skip posting if it is there; count the post as sent only when Slack returns `"ok": true` plus a message ts; update the ledger and bookmarks only after that. If the result is unclear, mark the run "maybe posted" and change nothing else.
- Write one record per day under `runs/` in the state store: status "posting" first, then either "posted" plus the message ID or "maybe posted".

### Agent instructions
- Tools: MCP tools ask for approval by default and nobody is present, so mark the needed toolset as always allowed, and compensate by giving its token read-only scope. Disable tools the job does not need (the post turns off web search and web fetch).
- Write the run steps as a short numbered list. Two worth copying in spirit:
  - Decide: an item earns a line only if the reader would act on it today or it changes an imminent decision; when unsure, leave it out; a count is not an item; an open item already reported is carried as one marked line ("still waiting, day 3"); a closed one is dropped silently; retired topics stay retired.
  - Verify: just before posting, re-check each item's live status. Resolved means drop it, changed means fix the line, unconfirmable means drop it and list it under cuts in the run record. Never hedge a status: assert it or drop it. Copy links from the source's own link field instead of assembling them.
- The post's reasoning: one stale "still waiting on you" costs more trust than several missing items.

### Schedule
- Use a cron expression with an explicit time zone, and also tell the agent in the first message which zone to compute dates in. Otherwise it may call this morning "yesterday" because it used the server's zone.
- Test without waiting for the schedule by starting a run by hand from the deployment.

### Memory
- Each run begins in a fresh sandbox, so feedback only sticks if it is stored. Stale memory is the opposite hazard: items reported as pending after resolution, or dropped as "already reported" while still open.
- Split memory by who writes it. Preferences (channels and repos to read, exclusions, length cap, destination, when to stop) are yours and read-only to the agent. State (bookmarks, ledger, run records, proposed changes to preferences, notes on source quirks such as "returns only the newest 50 items") is the agent's and read-write. A store's file is not created for you; seed your preferences before the first run.
- Re-read preferences at the start of every run instead of baking a copy into the prompt, which keeps enforcing rules you have changed. If the file cannot be read, the agent should stop and say so, not continue on defaults.
- Keep a ledger of everything reported: date, source, an ID that never changes (Slack message timestamp, pull request number) and last known status. It stops repeats and lets the brief report changes.

### Guardrails
- Treat text the agent reads as untrusted, since it can read as instructions. Limit the damage by capability: read-only GitHub token, read-only preferences store, an environment limited to allowlisted hosts. A planted instruction could still skew the brief, including through the agent's own notes, but it cannot write to GitHub or edit your rules.
- Slack is the exception because one token reads and posts, so invite the bot only to channels it must read or post in.
- Set a per-run spending cap from real runs: start at three to five times a normal run's cost and tighten later. A run that hits the cap pauses with a `budget_reached` stop reason rather than failing, so a cap that is too low looks like a brief that went quiet. The budget amount is a string in cents. See [budgets](https://platform.claude.com/docs/en/managed-agents/budgets).

## Checklist
1. Bookmarks per source.
2. Unreadable sources named in the brief.
3. Live re-check before posting.
4. Bookmarks and ledger touched only after a confirmed post.
5. Preferences re-read every run, kept out of the agent's reach.
6. Least-privilege access plus a per-run cap.

## Pitfalls
- Fixed look-back windows, which duplicate or miss items.
- Treating an empty result as a quiet day without checking that the source was reachable.
- Writing the ledger before the destination confirms the post.
- Hedged statuses ("may still be waiting") in the brief.
- Computing dates in the server's time zone.
- A preferences copy inside the prompt, or a preferences store the agent can write.
- A spending cap so low that runs pause silently.
- Giving one broad token to every source.
- Treating the template as finished: customize sources, destination and preferences.

## See also
- [long-runs.md](long-runs.md), [cloud-sessions.md](cloud-sessions.md), [tool-design.md](tool-design.md)
- If your agent has the built-in `claude-api` skill, it can walk through the managed-agents setup the post describes.
