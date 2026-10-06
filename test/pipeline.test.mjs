import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compose, pendingPosts, plan } from '../scripts/attention.mjs';
import { distillTask, htmlText, noteSources } from '../scripts/fetch-sources.mjs';

const POSTS = [
  { slug: 'alpha-post', title: 'Alpha', date: '2026-01-01', tag: 'playbooks' },
  { slug: 'beta-post', title: 'Beta', date: '2026-02-01', tag: '' },
];

function notesTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-pipeline-'));
  const dir = path.join(root, 'skills/claude-dev-skill/references');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'one.md'), '# One\n\nSources: [Alpha](https://claude.dev/blog/alpha-post/) (2026-01-01)\n');
  fs.writeFileSync(path.join(dir, 'two.md'), '# Two\n\nNo sources line here, but a link: https://claude.dev/blog/beta-post/\n');
  fs.writeFileSync(path.join(dir, 'index.md'), 'Sources: https://claude.dev/blog/beta-post/\n');
  return root;
}

test('noteSources reads only the Sources line of topic notes', () => {
  const root = notesTree();
  try {
    assert.deepEqual([...noteSources(root)], [['one.md', ['alpha-post']], ['two.md', []]]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('htmlText keeps visible text and decodes common entities', () => {
  assert.equal(htmlText('<p>Hello <b>world</b> &amp; friends</p><script>var x = "<p>hidden</p>";</script><style>p { color: red }</style>'), 'Hello world & friends');
  assert.equal(htmlText('<![CDATA[<p>It&#39;s &lt;fine&gt;</p>]]>'), "It's <fine>");
  assert.equal(htmlText('<li>one</li>\n\n  <li>two</li>'), 'one\ntwo');
  assert.equal(htmlText('&unknown; stays'), '&unknown; stays');
});

test('the distillation task names sources and the notes that cite each post', () => {
  const notes = new Map([['one.md', ['alpha-post']], ['two.md', []]]);
  const task = distillTask(POSTS, ['alpha-post', 'beta-post'], notes, '.cache/sources');
  assert.match(task, /`alpha-post`: Alpha \(2026-01-01, playbooks\)\n  - source: \.cache\/sources\/alpha-post\.md\n  - cited by: one\.md/);
  assert.match(task, /`beta-post`: Beta \(2026-02-01, untagged\)[\s\S]*cited by: none yet/);
  assert.match(task, /- two\.md: no sources line/);
  assert.match(task, /## Finish\n\nRun the guard, then write `\.cache\/distill-result\.json`/);
  assert.throws(() => distillTask(POSTS, ['ghost-post'], notes, '.cache/sources'), /Not on claude\.dev: ghost-post/);
});

const state = (overrides = {}) => ({
  termsUpdated: 'September 18, 2026',
  posts: { 'alpha-post': { sha256: 'a', distilled: 'a' }, 'beta-post': { sha256: 'b2', distilled: 'b1' } },
  ...overrides,
});
const policy = { termsReviewed: 'September 18, 2026' };

test('attention status lists pending posts, terms reviews and guard failures', () => {
  assert.deepEqual(pendingPosts(state()), ['beta-post']);
  const quiet = compose({ state: state({ posts: { 'alpha-post': { sha256: 'a', distilled: 'a' } } }), policy, hasToken: true });
  assert.equal(quiet.status, '');
  assert.deepEqual(quiet.events, []);
  assert.match(compose({ state: state(), policy, hasToken: false }).status, /CLAUDE_CODE_OAUTH_TOKEN[\s\S]*`beta-post`/);
  assert.match(compose({ state: state(), policy, hasToken: true, distill: 'failure' }).status, /Last attempt in this run: failure/);
  assert.match(compose({ state: state({ termsUpdated: 'December 1, 2026' }), policy, hasToken: true }).status, /Terms of Use changed/);
  assert.match(compose({ state: state(), policy, hasToken: true, guard: '[verbatim] x: 13 words' }).status, /were not applied[\s\S]*13 words/);
  assert.match(compose({ state: state(), policy, hasToken: true, releaseBlocked: '[links] y' }).status, /Release blocked/);
  const events = compose({ state: state(), policy, report: { removedPosts: [{ slug: 'gone', title: 'Gone' }], siteMapChanged: true } }).events;
  assert.deepEqual(events.map((event) => event.title), ['claude.dev removed 1 post(s)', 'claude.dev changed its llms.txt outside the post list']);
});

test('the status issue is created, edited only when the text changes, and closed when clear', () => {
  const run = 'https://github.com/o/r/actions/runs/1';
  assert.deepEqual(plan(undefined, '', run), { action: 'none' });
  const created = plan(undefined, '- something', run);
  assert.equal(created.action, 'create');
  assert.deepEqual(plan({ number: 4, body: created.body }, '- something', 'https://github.com/o/r/actions/runs/2'), { action: 'none' });
  assert.equal(plan({ number: 4, body: created.body }, '- something else', run).action, 'update');
  assert.equal(plan({ number: 4, body: created.body }, '  ', run).action, 'close');
});
