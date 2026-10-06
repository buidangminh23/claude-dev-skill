# Claude Code mods

Use this note to decide whether a Claude Code customization should be a mod (hooks that ship inside a plugin and remain active until the session ends), and to build, check and share one safely. It is distilled from the post below, in this project's own words.

Sources: [Getting started with Claude Code mods](https://claude.dev/blog/getting-started-with-claude-code-mods/) (2026-10-01)

## Use this when
- The user wants something always visible inside Claude Code: context-window fill, how much each turn added, a spend or rate-limit gauge, the files Claude has read so far.
- The user wants risky commands held or previewed before they run (`git reset --hard`, `rm -rf`, `git clean`, force pushes, database migrations, or stack-specific ones such as `terraform apply` or a production kubectl context).
- The user wants a custom way to review what Claude changed during the last turn.
- The user wants small session add-ons, such as team conventions added to every prompt (`prompt.submit`) or a toast once a long turn ends.
- A customization has to keep state between events, draw live UI, or add a slash command or a model-callable tool; that is what a mod offers beyond a settings hook.
- A mod misbehaves: its data disappears after a save, its drawing never shows up, `claude plugin validate` rejects a state key, or a hook that waits for the user times out.
- Someone wants to package a mod for others, or to install a mod someone else wrote (the mods listed on claude.dev are in [mods-catalog.md](mods-catalog.md)).

## Guidance

### Check the build first
- Confirm with `claude --version` that the user runs Claude Code 2.1.287 or newer, where mods are enabled by default (as of 2026-10-01), and expect the API to shift between releases.
- On every load, Claude Code generates type declarations for the installed build under `.claude-plugin/types/` in the mod folder; editors and `tsc -p` pick them up with no setup. Treat them as the authority and prefer them to any identifier quoted in this note.

### Choose the mechanism
- Start from the layers Claude Code already has (skills, slash commands, settings, permission rules, the status line); a mod is the step beyond them, for changing or replacing Claude Code's own behavior and for drawing custom UI.
- Know how it differs from a settings hook: that spawns a shell process per event and talks JSON over standard input and output, while a mod loads once and stays in memory for the session, so it can keep state, redraw its UI as events arrive, and drive Claude Code itself (open panes, launch processes, add slash commands, give the model new tools).
- For anything that must be blocked for sure, use permission rules. A guard that inspects command text is only a safety net: command substitution such as `$(…)`, shell aliases, or a script that runs `rm` can get around it.

### Know the shape
- Lay it out as a normal plugin: a manifest at `.claude-plugin/plugin.json`, and a `hooks/hooks.json` whose `modules` list holds exactly one module.
- Export `register(on, options)` from the module and attach hooks with `on(event, matcher?, hook)`. Each hook receives `($, e, next)`: `$` is the API object (`$.state`, `$.ui`, `$.session`, `$.fs`, `$.process`, `$.http`, `$.command` and others), `e` carries the event as a plain data object, and `next` hands the event on to other plugins and finally to Claude Code.
- Hooks form a middleware chain, so each hook makes one of three moves:
  - observe: `await next(e)`, look at the result, return it as is;
  - rewrite: pass a modified copy to `next`, for example a safer command;
  - answer: skip `next` and return your own result, such as `{ deny: "…" }`, to refuse a tool call or serve a command or tool directly.
- Pick events by what you need to see: tool calls (`tool.call`, matcher `{ tool: "Bash" }`), the prompt as submitted (`prompt.submit`), turns (`turn.start`, `turn.complete`), the session starting (`session.start`) and ending, slash commands (`command.run`), and each UI component as it renders (`ui.render`, matcher `{ component: "AbovePrompt" }`).
- Reach the outside world only through `$`: the module runs in its own sandbox, without a DOM or Node APIs.
- For worked examples, read the mods Claude Code itself ships, such as the `/diff` pane and AGENTS.md handling; their source and tests sit under `mods/` in [anthropics/claude-code](https://github.com/anthropics/claude-code).

### Draw on the surfaces
- Draw in the terminal or in the Code tab of the desktop app: the `AbovePrompt` band (Claude Code leaves it empty, so it is a safe first target), a `Pane` docked next to the transcript, a status line via `$.ui.status`, or a toast via `$.ui.toast`.
- Ask `$.ui.resolve(e)` for element constructors instead of using globals, because each surface accepts its own set of elements. JSX works too if you use `h` as its factory.
- Find component props on `e.props` (for example `hasSurvey` and `bodyColumns`); the top level of a render event holds only `component`, `surface`, `requestId` and `viewport`.
- Fit the tree to `bodyColumns`, the band's actual width, which shrinks whenever a side pane is open. Return `next(e)` when `hasSurvey` is set or you have nothing to show, so Claude Code and other mods get the band back.
- Use single-width glyphs (☀ ☁ ☂ ☇ ↯) rather than emoji, so columns stay aligned in any terminal font.
- Open a pane with `$.ui.open({ id, title, focus })`; if the answer is `isPlaced: false`, draw the same content in the band. The surface decides placement, so build one tree that works docked or inline.
- Give each button a digit hotkey: `Button({ label, hotkey, onPress })` responds to a click, to Tab plus Enter, or to the digit.

### Keep state across reloads
- Treat each save as a new load: `register` and `session.start` rerun and module-level variables start over. Keep anything that must persist in `$.state`, which the host holds for the session.
- Declare each state key in the type contract the manifest points to: `types/index.d.ts` adds it under `interface PluginState` inside `declare module "claude-code"`, keyed by plugin name, and `plugin.json` names the file in `"types"`. An undeclared key makes `claude plugin validate` fail, and the message spells out the fix.
- Do state reads inside the render hook: a read made there subscribes the drawing, so any later `$.state.set` triggers a redraw and `$.ui.invalidate` is never needed.

### Work with turns, commands, files and usage
- Check `e.agentId` in turn hooks so subagent turns stay out of main-loop logic, and keep per-turn work between a `turn.start` and the matching `turn.complete`.
- Register slash commands with `$.command.register` while handling `session.start`, and reply to them in a `command.run` hook.
- Before a Write replaces a file, grab the old text with `$.fs.read` so the diff you show is accurate.
- Call `$.session.usage()` as often as you like for the status-line numbers (`context.tokens`, `context.window`, `context.percent`); only asking for a `breakdown` costs a token-count call.

### Hold calls and run commands safely
- To wait for the user, loop on short `$.process.run(["sleep", "0.25"])` calls until a button sets the decision, and give up once `next.signal.aborted` is true (the user pressed Esc). Waiting inside `$` calls does not use up the hook's own time.
- Run dry-run commands through `$.process.run` with an argv array (`git status --porcelain`, `git clean -n`, migration listings), so no part of a path is interpreted by a shell.

### Build, validate, test
- Quickest route: in a `claude` session, describe what the mod should show (not how to code it) and allow hot reload when Claude asks. The mod appears when the turn ends, and later tweaks take effect without a restart.
- Such a mod lives only in that session, and its folder gets deleted eventually; to preserve it, copy the folder to a permanent location and install it as a plugin.
- Manual route: run `claude --plugin-dir ./your-mod`; Claude Code watches the folder and reloads the module on every save, without a restart.
- Run `claude plugin validate <dir>`: it reads the manifest and source exactly as Claude Code would, then lists the hooks, the `$` calls, and the state the module reads and writes.
- Run `claude plugin test <dir>` to execute test files matching `*.test.ts` (written against `claude-code/testing`) on the real runtime. Hooks a test registers sit after the mod and stand in for Claude Code's answers, for example `on("session.usage", …)`; `$.ui.mount` plus `ui.find` let a test assert on drawn text.
- If something you drew never appears, run `claude --debug`; the log reports any hook whose returned tree did not validate.

### Share and install with consent
- Distribute it like any plugin: a folder or GitHub repo holding `.claude-plugin/marketplace.json` is a marketplace, and a normal push publishes updates.
- Install from a shell with `claude plugin marketplace add <path-or-repo>` then `claude plugin install <name>@<marketplace> --scope user`, or inside a session with `/plugin marketplace add`, `/plugin install` and `/reload-plugins`. If the mod still does not appear, restarting Claude Code is the fallback.
- Never install a mod on the user's behalf without asking. A mod is code from its publisher, not Anthropic, and it executes on the user's machine with all the access Claude Code itself has. The post tells people to review the repository before installing and to stick to publishers they trust; installation happens only when the user runs the command.
- Plugins that include mods can be listed in the Claude directory; the post links its submission page on claude.ai.

## Numbers worth knowing
- 2.1.287: the minimum Claude Code version for mods, which are on by default from that release (as of 2026-10-01).
- 10 seconds: what a hook may spend per dispatch on its own work; waits inside `$` calls are excluded.
- Fallbacks in the post: Blast Radius drew its report in the band on a 120-column terminal, and Replay Theater opened inline above the prompt at 80 columns, so never assume a pane will dock.

## Pitfalls
- Module-level variables, which every save resets; use `$.state`.
- A state key missing from the type contract, which fails validation.
- Reading props from `e` instead of `e.props`, sizing to the terminal width instead of `bodyColumns`, or keeping the band when there is nothing to draw.
- A wait loop that never checks `next.signal`, so Esc cannot cancel it.
- Treating a command-text guard as a security boundary.
- Losing a Claude-built mod when its session folder is cleaned up.
- Trusting identifiers from the post or this note over the generated types on a newer build.
- Installing a mod nobody has read, from an unknown publisher, or without the user's go-ahead.

## See also
- [mods-catalog.md](mods-catalog.md): the generated list of mods currently listed on claude.dev.
- [skills.md](skills.md) for skills, one of the existing customization layers.
- [tool-design.md](tool-design.md) for designing a tool the model will call, if your mod registers one.
- If your agent has the built-in `plugin-authoring` skill, load it before writing or debugging a mod; the post itself leaves the how to Claude Code's built-in mod-writing guide.
- If your agent has the built-in `update-config` skill, use it for settings hooks and permission rules, the mechanism the post recommends for hard blocks.
