# When to ask for HTML instead of Markdown

Use this note to decide when output meant for a person should be one HTML file rather than Markdown, and how to build throwaway HTML editors that return the person's choices to the agent. It is distilled, in this project's own words, from the post below, which presents one Claude Code team member's personal practice (he sees others on the team adopting it).

Sources: [Using Claude Code: The unreasonable effectiveness of HTML](https://claude.dev/blog/using-claude-code-the-unreasonable-effectiveness-of-html/) (2026-05-20)

## Use this when
- A plan, spec or report will run past roughly 100 lines and someone actually has to read it.
- The content is visual: diagrams, flows, colors or design tokens, layouts, rendered diffs.
- Several approaches or designs should be compared side by side before a decision.
- The output goes to colleagues, or explains your change to a code reviewer.
- The user has to pick values that are awkward to describe in words: a color, an easing curve, a crop region, a cron schedule, a regex, animation timing.
- The user has to reorder, bucket, curate or annotate a batch of things (tickets, test cases, feedback, config flags, dataset rows, a transcript or a diff), or tune a prompt or template against live samples.

## Guidance

### Pick the format
- Make one HTML file when the output is long, visual, comparative or shared. The author admits he seldom reads Markdown files past about 100 lines and cannot get colleagues to read them at all.
- Let HTML carry what Markdown can only fake: real tables, SVG for diagrams and flows, CSS for design data such as colors and type scales, interactive controls, positioned or canvas layouts for spatial data, embedded images and code. Skip ASCII diagrams and Unicode shading posing as color swatches.
- Organize the page so it is easy to move around in (tabs, links, illustrations), and make it responsive so it also reads well on a phone.
- Share it by uploading the file and sending the link. Browsers generally show Markdown poorly, so it tends to travel as an email or chat attachment, and the post argues an HTML spec, report or PR write-up is far more likely to be read.
- Build the page in Claude Code, where the real context is: the file system, git history, MCP sources such as Slack or Linear, and the browser via Claude in Chrome. The post counts this among the main reasons to make these files there rather than in Claude.ai or Claude Design.
- Begin with a plain request for "an HTML file" or "an HTML artifact", but be clear about what the page must do and how you will use it. Prompt from scratch while you learn the use cases; a skill can make sense later for patterns that recur.

### Match the page to the job
- **Exploration and planning**: lay out several clearly different approaches on one page, each labeled with its tradeoff; develop the chosen one with mockups; then ask for an implementation plan with mockups, data flow and the code snippets worth reviewing. Pass all of these files to a new session for implementation, and have the verification agent read them too, so it knows what is needed.
- **Plans as a set**: rather than one plan, keep a few files for different stages (implementation plan, UI explorations, a page showing every design) and keep them afterwards as references for future work and verification.
- **Code review and explanation**: show the real diff with notes pinned to specific lines in the margin, color findings by severity, and spend the most attention where the reader is least familiar. The same page type works for writing a PR or for understanding an area of code.
- **Design and prototyping**: sketch in HTML even if the product ships in React or Swift (Claude Design itself is built on HTML). Add sliders and knobs to tune animations and interactions, with a copy button for the settings you settle on. Design-system pages and component libraries fit here too.
- **Reports and explainers**: have Claude gather material from the codebase, Slack, the web or git history and turn it into a long page, an interactive explainer or a slide deck, with SVG diagrams. Aim it at a reader who will go through it once, for example with a flow diagram, a few annotated key snippets and the gotchas at the bottom. Weekly status updates and incident reports belong here.

### Build throwaway editors
- When the user's intent is hard to express in a text box, ask for a disposable single-file editor built around exactly this data, rather than a general-purpose tool.
- End every such editor with an export button ("copy as JSON", "copy as prompt", "copy as Markdown", "copy diff") that turns the user's work in the page into text ready to hand back to Claude Code or commit as a file. Where possible, export only the changes, as the post's flag-editor example does.
- Shapes from the post's examples: a board of draggable ticket cards with Now, Next, Later and Cut columns that the agent pre-sorts, exporting the order with a short reason for each column; a form editor for feature flags, grouped by area, that shows dependencies and warns when someone switches on a flag that depends on one still disabled; a side-by-side prompt editor with highlighted variable slots, sample inputs that re-render live, and a character or token counter.
- Use sliders and knobs not only for design but also to try an algorithm's options and watch what changes.

### Keep the person in the loop
- Use these pages to stay engaged with the agent's choices instead of handing them off: the author noticed he was skimming plans as Claude took on more work, and says HTML is what pulled him back in.
- Let the export close the loop: the person decides inside the page and the result returns to the agent as a prompt or data, so the human stays involved and each round trip gets shorter.

### Know what Markdown still offers
- Switch for the reasons the post gives: outputs that run long, need visuals, must be shared, and are edited by prompting Claude rather than by hand (which removes one of Markdown's main benefits).
- Remember what the post credits Markdown with: it is simple, portable, easy to edit by hand, and often uses fewer tokens.
- Treat the author's near-total switch to HTML as his self-described maximalist position, not a rule; the post is labeled personal opinion.
- Expect HTML to cost more tokens; the author finds the richer expression and the much better chance of being read worth it.

## Numbers worth knowing
- About 100 lines: the author tends not to read Markdown beyond this length (2026-05-20).
- 1M-token context window of Opus 4.7: the author's reason HTML's extra tokens barely register in context (as of 2026-05-20). Model-bound; recheck on other models.

## Pitfalls
- A long Markdown plan nobody reads closely.
- ASCII art or Unicode shading where a real diagram or color belongs.
- An editor with no export, leaving the user's work stuck in the browser.
- Building a polished reusable tool where a one-off page would do.
- A page built from thin context when the repo, its history and connected sources were available.
- One monolithic plan instead of per-stage files that later sessions and verifiers can reuse.
- Sending `.md` files as attachments when a link would get read.

## See also
- [long-runs.md](long-runs.md) for briefing the fresh session that implements the plan.
- [skills.md](skills.md) for turning a recurring page type into a skill.
- [workflows.md](workflows.md) for setting up separate verification agents.
- Starter gallery linked from the post: [anthropics/html-effectiveness](https://github.com/anthropics/html-effectiveness).
- If your agent has the built-in `artifact-design` skill, load it for the craft of building and laying out the page.
- If your agent has the built-in `dataviz` skill, use it for charts inside such pages.
- If your agent has the built-in `artifact-capabilities` skill, a published page can collect and keep the user's input itself, an alternative to a copy-out button.
