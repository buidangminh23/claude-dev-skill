#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SITE, fetchText, parsePosts, parseMods, renderIndex, renderModsCatalog } from '../skills/claude-dev-skill/scripts/claude-dev.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATE_FILE = 'data/source-state.json';
export const INDEX_FILE = 'skills/claude-dev-skill/references/index.md';
export const MODS_FILE = 'skills/claude-dev-skill/references/mods-catalog.md';
export const MAX_REMOVED_SHARE = 0.3;
const SCHEMA = 1;

export const sha256 = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');

export function emptyState() {
  return { schema: SCHEMA, siteMap: null, termsUpdated: null, mods: [], posts: {}, etags: {} };
}

export function readState(root = ROOT) {
  const file = path.join(root, STATE_FILE);
  if (!fs.existsSync(file)) return emptyState();
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state.schema !== SCHEMA) throw new Error(`${STATE_FILE} has schema ${state.schema}, expected ${SCHEMA}`);
  return { ...emptyState(), ...state };
}

export function writeState(root, state) {
  fs.mkdirSync(path.dirname(path.join(root, STATE_FILE)), { recursive: true });
  fs.writeFileSync(path.join(root, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Hash of llms.txt without the per-post lines, so it only moves when the site adds or removes a kind of resource.
 */
export function siteMapHash(llms) {
  return sha256(llms.split('\n').filter((line) => !line.includes(`${SITE}/blog/`)).join('\n').trim());
}

/**
 * The "last updated" date of the Terms of Use, or null when the page layout no longer shows one.
 */
export function termsUpdated(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return /last updated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(text)?.[1] ?? null;
}

async function withRetry(task, { attempts = 3, delayMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * 4 ** (attempt - 1)));
    }
  }
  throw lastError;
}

/**
 * Fetch every watched resource. Post markdown, the mods page and the terms page use the stored ETag; a 304 keeps the
 * stored value.
 */
export async function collect(previous, { fetchImpl = globalThis.fetch, retry = {} } = {}) {
  const get = (url, etag) => withRetry(() => fetchText(url, { etag, fetchImpl }), retry);
  const posts = parsePosts((await get(`${SITE}/posts.json`)).text);
  const llms = (await get(`${SITE}/llms.txt`)).text;
  const etags = {};
  const modsResponse = await get(`${SITE}/mods/`, previous.etags['page:mods']);
  const mods = modsResponse.status === 304 ? previous.mods : parseMods(modsResponse.text);
  if (modsResponse.etag) etags['page:mods'] = modsResponse.etag;
  const termsResponse = await get(`${SITE}/terms/`, previous.etags['page:terms']);
  const terms = termsResponse.status === 304 ? previous.termsUpdated : termsUpdated(termsResponse.text);
  if (termsResponse.etag) etags['page:terms'] = termsResponse.etag;
  const markdown = {};
  for (const post of posts) {
    const known = previous.posts[post.slug];
    const response = await get(post.markdownUrl, known ? previous.etags[`post:${post.slug}`] : undefined);
    if (response.status === 304 && known) markdown[post.slug] = known.sha256;
    else {
      if (!response.text || !response.text.trim()) throw new Error(`${post.markdownUrl} returned an empty body`);
      markdown[post.slug] = sha256(response.text);
    }
    if (response.etag) etags[`post:${post.slug}`] = response.etag;
  }
  return { posts, mods, siteMap: siteMapHash(llms), termsUpdated: terms, markdown, etags };
}

const modKey = (mod) => JSON.stringify([mod.name, mod.kind, mod.source, mod.install]);

/**
 * Compare the previous state with a fresh collection. Pure: no network, no disk.
 */
export function diff(previous, collected) {
  const current = new Map(collected.posts.map((post) => [post.slug, post]));
  const describe = (post) => ({ slug: post.slug, title: post.title, date: post.date, url: post.url });
  const newPosts = collected.posts.filter((post) => !previous.posts[post.slug]).map(describe);
  const changedPosts = collected.posts
    .filter((post) => previous.posts[post.slug] && previous.posts[post.slug].sha256 !== collected.markdown[post.slug])
    .map(describe);
  const removedPosts = Object.entries(previous.posts)
    .filter(([slug]) => !current.has(slug))
    .map(([slug, info]) => ({ slug, title: info.title, date: info.date }));
  const pending = collected.posts
    .filter((post) => previous.posts[post.slug]?.distilled !== collected.markdown[post.slug])
    .map(describe);
  const before = new Map(previous.mods.map((mod) => [mod.name, modKey(mod)]));
  const after = new Map(collected.mods.map((mod) => [mod.name, modKey(mod)]));
  const newMods = [...after.keys()].filter((name) => !before.has(name));
  const removedMods = [...before.keys()].filter((name) => !after.has(name));
  const changedMods = [...after.keys()].filter((name) => before.has(name) && before.get(name) !== after.get(name));
  const siteMapChanged = previous.siteMap !== null && previous.siteMap !== collected.siteMap;
  const termsChanged = previous.termsUpdated !== null && previous.termsUpdated !== collected.termsUpdated;
  return { newPosts, changedPosts, removedPosts, pending, newMods, removedMods, changedMods, siteMapChanged, termsChanged, termsUpdated: collected.termsUpdated };
}

/**
 * Build the state to persist. ETags ride along but never cause a write on their own; the distilled hash of a post
 * only moves when a distillation is marked successful.
 */
export function nextState(previous, collected) {
  const posts = {};
  for (const post of [...collected.posts].sort((a, b) => a.slug.localeCompare(b.slug))) {
    posts[post.slug] = {
      date: post.date,
      title: post.title,
      sha256: collected.markdown[post.slug],
      distilled: previous.posts[post.slug]?.distilled ?? null,
    };
  }
  const etags = {};
  for (const key of Object.keys(collected.etags).sort()) etags[key] = collected.etags[key];
  return { schema: SCHEMA, siteMap: collected.siteMap, termsUpdated: collected.termsUpdated, mods: collected.mods, posts, etags };
}

const contentOf = (state) => JSON.stringify({ siteMap: state.siteMap, termsUpdated: state.termsUpdated, mods: state.mods, posts: state.posts });

/**
 * Record that the listed posts were distilled at their current hash. "pending" marks every post that is behind.
 * With `expected`, the state the distillation worked from, a post that changed or disappeared since then stays as it
 * is, so the next run distills the newer text.
 */
export function markDistilled(state, slugs, expected = null) {
  const targets = slugs.includes('pending') ? Object.keys(state.posts).filter((slug) => state.posts[slug].distilled !== state.posts[slug].sha256) : slugs;
  const marked = [];
  for (const slug of targets) {
    if (!state.posts[slug]) {
      if (expected) continue;
      throw new Error(`Unknown post: ${slug}`);
    }
    if (expected && expected.posts?.[slug]?.sha256 !== state.posts[slug].sha256) continue;
    state.posts[slug].distilled = state.posts[slug].sha256;
    marked.push(slug);
  }
  return marked;
}

/**
 * Notes for CHANGELOG and the release body, written in our own words around titles and links only.
 */
export function releaseNotes(report) {
  const lines = [];
  const list = (heading, items, render) => {
    if (!items.length) return;
    lines.push(`### ${heading}`, '', ...items.map(render), '');
  };
  list('New posts on claude.dev', report.newPosts, (post) => `- ${post.date} [${post.title}](${post.url})`);
  list('Updated posts on claude.dev', report.changedPosts, (post) => `- [${post.title}](${post.url})`);
  list('Removed from claude.dev', report.removedPosts, (post) => `- ${post.title} (\`${post.slug}\`)`);
  list('New mods listed', report.newMods, (name) => `- \`${name}\``);
  list('Changed mod listings', report.changedMods, (name) => `- \`${name}\``);
  list('Mods no longer listed', report.removedMods, (name) => `- \`${name}\``);
  if (report.siteMapChanged) lines.push('### Site map', '', '- claude.dev changed the non-post part of its llms.txt; check for new resource types.', '');
  if (report.termsChanged) lines.push('### Terms of Use', '', `- The claude.dev Terms of Use now show "last updated ${report.termsUpdated ?? 'unknown'}"; review the content policy.`, '');
  return lines.join('\n').trim();
}

function writeIfChanged(root, relative, content) {
  const file = path.join(root, relative);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

/**
 * Run one detection pass. With write=true the generated references and the state file are updated in place.
 * A pass that would drop more than MAX_REMOVED_SHARE of the known posts is refused as a probable site glitch.
 */
export async function detect({ root = ROOT, write = false, fetchImpl, retry } = {}) {
  const previous = readState(root);
  const collected = await collect(previous, { fetchImpl, retry });
  const report = diff(previous, collected);
  const known = Object.keys(previous.posts).length;
  if (known >= 5 && report.removedPosts.length / known > MAX_REMOVED_SHARE) {
    throw new Error(`Refusing to drop ${report.removedPosts.length} of ${known} known posts in one pass; check claude.dev before updating`);
  }
  const outputs = { [INDEX_FILE]: renderIndex(collected.posts), [MODS_FILE]: renderModsCatalog(collected.mods) };
  const state = nextState(previous, collected);
  const stateChanged = contentOf(previous) !== contentOf(state);
  const filesChanged = Object.entries(outputs)
    .filter(([relative, content]) => !fs.existsSync(path.join(root, relative)) || fs.readFileSync(path.join(root, relative), 'utf8') !== content)
    .map(([relative]) => relative);
  if (stateChanged) filesChanged.push(STATE_FILE);
  if (write) {
    for (const [relative, content] of Object.entries(outputs)) writeIfChanged(root, relative, content);
    if (stateChanged) writeState(root, state);
  }
  return { ...report, filesChanged, changed: filesChanged.length > 0, postCount: collected.posts.length, modCount: collected.mods.length };
}

function parseArgs(argv) {
  const args = { write: false, report: null, notes: null, markDistilled: null, expectState: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--write') args.write = true;
    else if (flag === '--report') args.report = argv[++index];
    else if (flag === '--notes') args.notes = argv[++index];
    else if (flag === '--mark-distilled') args.markDistilled = (argv[++index] ?? '').split(',').filter(Boolean);
    else if (flag === '--expect-state') args.expectState = argv[++index];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.markDistilled) {
    const state = readState(ROOT);
    const expected = args.expectState ? JSON.parse(fs.readFileSync(args.expectState, 'utf8')) : null;
    const marked = markDistilled(state, args.markDistilled, expected);
    writeState(ROOT, state);
    const skipped = args.markDistilled.filter((slug) => slug !== 'pending' && !marked.includes(slug));
    process.stdout.write(`Marked distilled: ${marked.join(', ') || 'nothing'}${skipped.length ? `. Changed since the run started, left pending: ${skipped.join(', ')}` : ''}\n`);
    return;
  }
  const report = await detect({ write: args.write });
  const notes = releaseNotes(report);
  if (args.report) fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  if (args.notes) fs.writeFileSync(args.notes, notes ? `${notes}\n` : '');
  const policyFile = path.join(ROOT, 'data/policy.json');
  const termsOk = fs.existsSync(policyFile) && JSON.parse(fs.readFileSync(policyFile, 'utf8')).termsReviewed === report.termsUpdated;
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, [
      `changed=${report.changed}`,
      `terms_ok=${termsOk}`,
      `fresh=${report.newPosts.length + report.changedPosts.length > 0}`,
      `pending=${report.pending.map((post) => post.slug).join(',')}`,
      `removed=${report.removedPosts.length}`,
      `site_map_changed=${report.siteMapChanged}`,
      `terms_changed=${report.termsChanged}`,
      `post_count=${report.postCount}`,
    ].join('\n') + '\n');
  }
  process.stdout.write(`${report.postCount} posts, ${report.modCount} mods, ${report.pending.length} pending distillation. `);
  process.stdout.write(report.changed ? `Changed: ${report.filesChanged.join(', ')}\n` : 'No change.\n');
  if (notes) process.stdout.write(`${notes}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
