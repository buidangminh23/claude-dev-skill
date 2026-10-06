#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LABEL = 'claude-dev-update';
export const TITLE = 'claude.dev update needs attention';
const MARK = /<!-- status:([0-9a-f]{12}) -->/;

export function readPolicy(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data/policy.json'), 'utf8'));
}

export function pendingPosts(state) {
  return Object.entries(state.posts).filter(([, post]) => post.distilled !== post.sha256).map(([slug]) => slug);
}

/**
 * Turn the state after a run into the rolling status text (empty when nothing needs a person) and one-off events.
 */
export function compose({ state, policy, report = {}, hasToken = false, distill = 'skipped', guard = '', releaseBlocked = '' }) {
  const items = [];
  if (state.termsUpdated !== policy.termsReviewed) {
    items.push(`- **Terms of Use changed.** claude.dev shows "last updated ${state.termsUpdated ?? 'unknown'}", but \`data/policy.json\` records a review of "${policy.termsReviewed}". Distillation is paused. Read https://claude.dev/terms/, adjust the content policy if needed, then set \`termsReviewed\` to the new date.`);
  }
  const pending = pendingPosts(state);
  if (pending.length) {
    const list = pending.map((slug) => `\`${slug}\``).join(', ');
    if (!hasToken) items.push(`- **${pending.length} post(s) wait for distillation** because the \`CLAUDE_CODE_OAUTH_TOKEN\` secret is not set: ${list}. The index already lists them, so agents still find and read them; notes follow once the secret exists.`);
    else items.push(`- **${pending.length} post(s) wait for distillation**: ${list}. Last attempt in this run: ${distill}. Retries run at 03, 09, 15 and 21 UTC, or start one with the workflow's "distill" input.`);
  }
  if (guard.trim()) items.push(`- **Distilled notes were not applied.** Nothing from that attempt was published:\n\n\`\`\`\n${guard.trim().slice(0, 3000)}\n\`\`\``);
  if (releaseBlocked.trim()) items.push(`- **Release blocked:**\n\n\`\`\`\n${releaseBlocked.trim().slice(0, 3000)}\n\`\`\``);
  const events = [];
  if (report.removedPosts?.length) events.push({ title: `claude.dev removed ${report.removedPosts.length} post(s)`, body: `Removed: ${report.removedPosts.map((post) => `\`${post.slug}\` (${post.title})`).join(', ')}.\n\nNotes that cite them now fail the link check. Remove or replace those citations.` });
  if (report.siteMapChanged) events.push({ title: 'claude.dev changed its llms.txt outside the post list', body: 'The non-post part of https://claude.dev/llms.txt changed. Check whether the site added a new kind of resource worth watching.' });
  return { status: items.join('\n\n'), events };
}

export function plan(issue, status, runUrl) {
  const text = status.trim();
  if (!text) return issue ? { action: 'close', comment: `All clear as of ${runUrl}.` } : { action: 'none' };
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
  const body = `<!-- status:${hash} -->\n${text}\n\nLast changed by ${runUrl}. The update workflow edits and closes this issue on its own.\n`;
  if (!issue) return { action: 'create', body };
  if (MARK.exec(issue.body ?? '')?.[1] === hash) return { action: 'none' };
  return { action: 'update', body };
}

const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] });
const readText = (file) => (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function main(argv) {
  const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/source-state.json'), 'utf8'));
  const report = readText(option(argv, '--report')) ? JSON.parse(readText(option(argv, '--report'))) : {};
  const { status, events } = compose({
    state,
    policy: readPolicy(),
    report,
    hasToken: option(argv, '--has-token') === 'true',
    distill: option(argv, '--distill') ?? 'skipped',
    guard: readText(option(argv, '--guard')),
    releaseBlocked: readText(option(argv, '--release-blocked')),
  });
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY ?? 'local'}/actions/runs/${process.env.GITHUB_RUN_ID ?? '0'}`;
  if (argv.includes('--dry-run')) {
    process.stdout.write(`${JSON.stringify({ status, events }, null, 2)}\n`);
    return;
  }
  gh(['label', 'create', LABEL, '--color', 'FBCA04', '--description', 'Raised by the claude.dev update workflow', '--force']);
  const open = JSON.parse(gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--search', `in:title "${TITLE}"`, '--json', 'number,body', '--limit', '1']));
  const step = plan(open[0], status, runUrl);
  if (step.action === 'create') gh(['issue', 'create', '--title', TITLE, '--label', LABEL, '--body-file', '-'], step.body);
  if (step.action === 'update') gh(['issue', 'edit', String(open[0].number), '--body-file', '-'], step.body);
  if (step.action === 'close') gh(['issue', 'close', String(open[0].number), '--comment', step.comment]);
  for (const event of events) gh(['issue', 'create', '--title', event.title, '--label', LABEL, '--body-file', '-'], `${event.body}\n\nRaised by ${runUrl}.\n`);
  process.stdout.write(`Status issue: ${step.action}. One-off issues: ${events.length}.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
