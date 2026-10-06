import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INDEX_FILE, MODS_FILE, STATE_FILE, collect, detect, emptyState, markDistilled, readState, releaseNotes, siteMapHash, termsUpdated, writeState } from '../scripts/detect.mjs';

const SITE = 'https://claude.dev';
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const termsPage = (date) => `<html><body><h1>Terms</h1><p>LAST UPDATED</p><p>${date}</p><script>{"posts":["${date}"]}</script></body></html>`;

function llms(extra = '') {
  return [
    '# fixture',
    '',
    '## posts',
    '',
    `- [A newer fixture post](${SITE}/blog/newer-fixture-post/): 2026-03-04`,
    `- [An older fixture post](${SITE}/blog/older-fixture-post/): 2026-01-02`,
    '',
    '## other',
    '',
    `- [posts.json](${SITE}/posts.json): the post index as data`,
    extra,
  ].join('\n');
}

function fakeSite(overrides = {}) {
  const routes = {
    [`${SITE}/posts.json`]: { body: fixture('posts.json') },
    [`${SITE}/llms.txt`]: { body: llms() },
    [`${SITE}/mods/`]: { body: fixture('mods.html'), etag: 'W/"mods-1"' },
    [`${SITE}/terms/`]: { body: termsPage('September 18, 2026'), etag: '"terms-1"' },
    [`${SITE}/blog/older-fixture-post.md`]: { body: fixture('older-fixture-post.md'), etag: '"older-1"' },
    [`${SITE}/blog/newer-fixture-post.md`]: { body: fixture('newer-fixture-post.md'), etag: '"newer-1"' },
    ...overrides,
  };
  const calls = [];
  const fetchImpl = async (url, { headers = {} } = {}) => {
    calls.push({ url, etag: headers['if-none-match'] });
    const route = routes[url];
    if (!route) return new Response('missing', { status: 404 });
    if (route.failTimes > 0) {
      route.failTimes -= 1;
      throw new Error('network down');
    }
    if (route.etag && headers['if-none-match'] === route.etag) return new Response(null, { status: 304, headers: { etag: route.etag } });
    return new Response(route.body, { status: 200, headers: route.etag ? { etag: route.etag } : {} });
  };
  return { fetchImpl, calls, routes };
}

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-detect-'));
const run = (root, site, write = true) => detect({ root, write, fetchImpl: site.fetchImpl, retry: { attempts: 1, delayMs: 0 } });
const withRoot = async (body) => {
  const root = tempRoot();
  try {
    await body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('first run reports every published post as new and pending, and writes the generated files', () => withRoot(async (root) => {
  const report = await run(root, fakeSite());
  assert.deepEqual(report.newPosts.map((post) => post.slug), ['newer-fixture-post', 'older-fixture-post']);
  assert.deepEqual(report.pending.map((post) => post.slug), ['newer-fixture-post', 'older-fixture-post']);
  assert.deepEqual(report.newMods, ['alpha-mod', 'beta.mod', 'gamma-mod', 'orphan-mod']);
  assert.equal(report.termsUpdated, 'September 18, 2026');
  assert.equal(report.termsChanged, false);
  assert.deepEqual(report.filesChanged.sort(), [INDEX_FILE, MODS_FILE, STATE_FILE].sort());
  for (const file of [INDEX_FILE, MODS_FILE, STATE_FILE]) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.ok(!fs.readFileSync(path.join(root, INDEX_FILE), 'utf8').includes('draft-fixture-post'));
}));

test('an unchanged site produces no change and uses conditional requests', () => withRoot(async (root) => {
  await run(root, fakeSite());
  const site = fakeSite();
  const report = await run(root, site);
  assert.equal(report.changed, false);
  for (const url of [`${SITE}/mods/`, `${SITE}/terms/`, `${SITE}/blog/older-fixture-post.md`]) {
    assert.ok(site.calls.find((call) => call.url === url).etag, `conditional request for ${url}`);
  }
}));

test('a new ETag with the same body never rewrites the state file', () => withRoot(async (root) => {
  await run(root, fakeSite());
  const before = fs.readFileSync(path.join(root, STATE_FILE), 'utf8');
  const report = await run(root, fakeSite({ [`${SITE}/blog/older-fixture-post.md`]: { body: fixture('older-fixture-post.md'), etag: '"older-2"' } }));
  assert.equal(report.changed, false);
  assert.equal(fs.readFileSync(path.join(root, STATE_FILE), 'utf8'), before);
}));

test('posts stay pending until distillation is marked, and an edit makes them pending again', () => withRoot(async (root) => {
  await run(root, fakeSite());
  const state = readState(root);
  assert.deepEqual(markDistilled(state, ['pending']).sort(), ['newer-fixture-post', 'older-fixture-post']);
  writeState(root, state);
  assert.deepEqual((await run(root, fakeSite())).pending, []);
  const edited = fakeSite({ [`${SITE}/blog/older-fixture-post.md`]: { body: `${fixture('older-fixture-post.md')}\nOne more paragraph.\n`, etag: '"older-2"' } });
  const first = await run(root, edited);
  assert.deepEqual(first.changedPosts.map((post) => post.slug), ['older-fixture-post']);
  assert.deepEqual(first.pending.map((post) => post.slug), ['older-fixture-post']);
  const second = await run(root, edited);
  assert.deepEqual(second.changedPosts, []);
  assert.deepEqual(second.pending.map((post) => post.slug), ['older-fixture-post']);
  assert.throws(() => markDistilled(readState(root), ['no-such-post']), /Unknown post/);
}));

test('removed posts and changed mod listings are reported separately', () => withRoot(async (root) => {
  await run(root, fakeSite());
  const posts = JSON.parse(fixture('posts.json'));
  posts.posts = posts.posts.filter((post) => post.slug !== 'older-fixture-post');
  const mods = fixture('mods.html').replace('gamma-mod', 'delta-mod').replace('gamma-mod@fixture-market', 'delta-mod@fixture-market');
  const report = await run(root, fakeSite({ [`${SITE}/posts.json`]: { body: JSON.stringify(posts) }, [`${SITE}/mods/`]: { body: mods, etag: 'W/"mods-2"' } }));
  assert.deepEqual(report.removedPosts.map((post) => post.slug), ['older-fixture-post']);
  assert.deepEqual(report.newMods, ['delta-mod']);
  assert.deepEqual(report.removedMods, ['gamma-mod']);
  assert.ok(!fs.readFileSync(path.join(root, INDEX_FILE), 'utf8').includes('older-fixture-post'));
}));

test('a pass that would drop most known posts is refused', () => withRoot(async (root) => {
  const many = { posts: Array.from({ length: 6 }, (_, index) => ({ slug: `post-${index}`, title: `Post ${index}`, date: `2026-01-0${index + 1}`, draft: false })) };
  const routes = Object.fromEntries(many.posts.map((post) => [`${SITE}/blog/${post.slug}.md`, { body: `Body of ${post.slug}` }]));
  await run(root, fakeSite({ [`${SITE}/posts.json`]: { body: JSON.stringify(many) }, ...routes }));
  const fewer = { posts: many.posts.slice(0, 2) };
  await assert.rejects(run(root, fakeSite({ [`${SITE}/posts.json`]: { body: JSON.stringify(fewer) }, ...routes })), /Refusing to drop 4 of 6/);
}));

test('terms and site map changes are noticed without noise from post lines', () => withRoot(async (root) => {
  assert.equal(termsUpdated(termsPage('September 18, 2026')), 'September 18, 2026');
  assert.equal(termsUpdated('<p>No date here</p>'), null);
  const base = siteMapHash(llms());
  assert.equal(siteMapHash(llms().replace('2026-03-04', '2026-03-05')), base);
  assert.equal(siteMapHash(`${llms()}\n- [Another post](${SITE}/blog/another/): 2026-04-01`), base);
  assert.notEqual(siteMapHash(llms(`- [videos.json](${SITE}/videos.json): every video`)), base);
  await run(root, fakeSite());
  const report = await run(root, fakeSite({
    [`${SITE}/terms/`]: { body: termsPage('December 1, 2026'), etag: '"terms-2"' },
    [`${SITE}/llms.txt`]: { body: llms(`- [videos.json](${SITE}/videos.json): every video`) },
  }));
  assert.equal(report.termsChanged, true);
  assert.equal(report.termsUpdated, 'December 1, 2026');
  assert.equal(report.siteMapChanged, true);
}));

test('empty markdown bodies fail the run and transient errors are retried', async () => {
  await assert.rejects(collect(emptyState(), { fetchImpl: fakeSite({ [`${SITE}/blog/newer-fixture-post.md`]: { body: '   ' } }).fetchImpl, retry: { attempts: 1 } }), /empty body/);
  const flaky = fakeSite();
  flaky.routes[`${SITE}/posts.json`].failTimes = 1;
  const collected = await collect(emptyState(), { fetchImpl: flaky.fetchImpl, retry: { attempts: 2, delayMs: 0 } });
  assert.equal(collected.posts.length, 2);
  const broken = fakeSite();
  broken.routes[`${SITE}/posts.json`].failTimes = 5;
  await assert.rejects(collect(emptyState(), { fetchImpl: broken.fetchImpl, retry: { attempts: 2, delayMs: 0 } }), /network down/);
});

test('release notes list titles and links, never post text', () => {
  const empty = { newPosts: [], changedPosts: [], removedPosts: [], newMods: [], changedMods: [], removedMods: [], siteMapChanged: false, termsChanged: false };
  const notes = releaseNotes({
    ...empty,
    newPosts: [{ slug: 'a', title: 'Title A', date: '2026-01-01', url: `${SITE}/blog/a/` }],
    removedPosts: [{ slug: 'b', title: 'Title B', date: '2025-12-01' }],
    newMods: ['m'],
    siteMapChanged: true,
    termsChanged: true,
    termsUpdated: 'December 1, 2026',
  });
  assert.match(notes, /### New posts on claude\.dev\n\n- 2026-01-01 \[Title A\]\(https:\/\/claude\.dev\/blog\/a\/\)/);
  assert.match(notes, /### Removed from claude\.dev\n\n- Title B \(`b`\)/);
  assert.match(notes, /### New mods listed\n\n- `m`/);
  assert.match(notes, /### Site map/);
  assert.match(notes, /last updated December 1, 2026/);
  assert.equal(releaseNotes(empty), '');
});

test('marking against the state a run worked from leaves changed posts pending', () => {
  const state = { posts: { a: { sha256: '2', distilled: '1' }, b: { sha256: '5', distilled: '4' } } };
  const expected = { posts: { a: { sha256: '2' }, b: { sha256: '4' } } };
  assert.deepEqual(markDistilled(state, ['a', 'b', 'gone'], expected), ['a']);
  assert.equal(state.posts.a.distilled, '2');
  assert.equal(state.posts.b.distilled, '4');
  assert.throws(() => markDistilled(state, ['gone']), /Unknown post/);
});
