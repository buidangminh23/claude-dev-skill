import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchText, indexedSlugs, parseMods, parsePosts, releaseStatus, renderIndex, renderModsCatalog } from '../skills/claude-dev-skill/scripts/claude-dev.mjs';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parsePosts drops drafts, sorts newest first and builds links', () => {
  const posts = parsePosts(fixture('posts.json'));
  assert.deepEqual(posts.map((post) => post.slug), ['newer-fixture-post', 'older-fixture-post']);
  assert.equal(posts[0].url, 'https://claude.dev/blog/newer-fixture-post/');
  assert.equal(posts[0].markdownUrl, 'https://claude.dev/blog/newer-fixture-post.md');
  assert.deepEqual(posts[1].sections, [{ id: 'first-part', title: 'First part' }, { id: 'second-part', title: 'Second | part' }]);
  assert.equal(posts[1].minutes, 4);
});

test('parsePosts rejects a changed shape instead of guessing', () => {
  assert.throws(() => parsePosts('{"items": []}'), /no posts array/);
  assert.throws(() => parsePosts({ posts: [{ slug: 'Bad Slug', title: 'x', date: '2026-01-01' }] }), /unexpected slug/);
  assert.throws(() => parsePosts({ posts: [{ slug: 'ok', title: 'x', date: 'January' }] }), /unexpected date/);
  assert.throws(() => parsePosts({ posts: [{ slug: 'ok', date: '2026-01-01' }] }), /without title/);
  assert.throws(() => parsePosts({ posts: [{ slug: 'ok', title: 'x', date: '2026-01-01', draft: true }] }), /no published posts/);
});

test('parseMods keeps names, kinds, sources and install commands only', () => {
  const mods = parseMods(fixture('mods.html'));
  assert.deepEqual(mods.map((mod) => mod.name), ['alpha-mod', 'beta.mod', 'gamma-mod', 'orphan-mod']);
  assert.equal(mods.find((mod) => mod.name === 'alpha-mod').kind, 'built-in');
  assert.equal(mods.find((mod) => mod.name === 'gamma-mod').install, 'claude plugin install gamma-mod@fixture-market');
  assert.equal(mods.find((mod) => mod.name === 'orphan-mod').source, null);
  assert.deepEqual(parseMods('<p>nothing here</p>'), []);
});

test('renderIndex is deterministic, escapes table cells and round-trips slugs', () => {
  const posts = parsePosts(fixture('posts.json'));
  const first = renderIndex(posts);
  assert.equal(first, renderIndex(parsePosts(fixture('posts.json'))));
  assert.match(first, /Second \\\| part/);
  assert.match(first, /\[md\]\(https:\/\/claude\.dev\/blog\/older-fixture-post\.md\)/);
  assert.deepEqual([...indexedSlugs(first)].sort(), ['newer-fixture-post', 'older-fixture-post']);
  assert.equal(indexedSlugs('').size, 0);
});

test('renderModsCatalog marks built-in mods and keeps the install command', () => {
  const catalog = renderModsCatalog(parseMods(fixture('mods.html')));
  assert.match(catalog, /`alpha-mod` \| built-in .* ships with Claude Code/);
  assert.match(catalog, /`claude plugin install gamma-mod@fixture-market`/);
  assert.match(renderModsCatalog([]), /none found/);
});

test('fetchText sends the ETag and treats 304 as unchanged', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push(options.headers);
    if (options.headers['if-none-match'] === '"v1"') return new Response(null, { status: 304 });
    return new Response('body', { status: 200, headers: { etag: '"v1"' } });
  };
  assert.deepEqual(await fetchText('https://claude.dev/x', { fetchImpl }), { status: 200, etag: '"v1"', text: 'body' });
  assert.deepEqual(await fetchText('https://claude.dev/x', { fetchImpl, etag: '"v1"' }), { status: 304, etag: '"v1"', text: null });
  assert.match(seen[0]['user-agent'], /claude-dev-skill/);
  await assert.rejects(fetchText('https://claude.dev/x', { fetchImpl: async () => new Response('no', { status: 503 }) }), /HTTP 503/);
});

test('releaseStatus compares the installed marker with releases/latest', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-marker-'));
  const marker = path.join(dir, '.release');
  const redirectTo = (tag) => async (url, options) => {
    assert.equal(url, 'https://github.com/buidangminh23/claude-dev-skill/releases/latest');
    assert.equal(options.redirect, 'manual');
    return { headers: new Headers({ location: `https://github.com/buidangminh23/claude-dev-skill/releases/tag/${tag}` }) };
  };
  try {
    assert.equal(await releaseStatus({ marker, fetchImpl: redirectTo('v0.1.1') }), null);
    fs.writeFileSync(marker, 'v0.1.0\n');
    assert.deepEqual(await releaseStatus({ marker, fetchImpl: redirectTo('v0.1.1') }), { installed: 'v0.1.0', latest: 'v0.1.1', behind: true });
    assert.equal((await releaseStatus({ marker, fetchImpl: redirectTo('v0.1.0') })).behind, false);
    assert.equal((await releaseStatus({ marker, fetchImpl: async () => ({ headers: new Headers() }) })).behind, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
