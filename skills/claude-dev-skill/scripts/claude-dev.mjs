#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://claude.dev';
export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INDEX_PATH = path.join(SKILL_DIR, 'references', 'index.md');
export const MODS_PATH = path.join(SKILL_DIR, 'references', 'mods-catalog.md');
const USER_AGENT = 'claude-dev-skill (+https://github.com/buidangminh23/claude-dev-skill)';
const REPOSITORY = 'buidangminh23/claude-dev-skill';
const RELEASE_MARKER = path.join(SKILL_DIR, '.release');
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * GET a claude.dev resource. With an ETag the request is conditional and a 304 returns text null.
 */
export async function fetchText(url, { etag, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const headers = { 'user-agent': USER_AGENT };
  if (etag) headers['if-none-match'] = etag;
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 304) return { status: 304, etag, text: null };
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
  return { status: response.status, etag: response.headers.get('etag'), text: await response.text() };
}

/**
 * Normalize posts.json into published posts sorted newest first. Throws when the shape changed.
 */
export function parsePosts(source) {
  const data = typeof source === 'string' ? JSON.parse(source) : source;
  if (!data || !Array.isArray(data.posts)) throw new Error('posts.json has no posts array');
  const posts = data.posts.filter((post) => post && post.draft !== true).map((post) => {
    for (const field of ['slug', 'title', 'date']) {
      if (typeof post[field] !== 'string' || !post[field].trim()) throw new Error(`posts.json has a post without ${field}`);
    }
    if (!SLUG.test(post.slug)) throw new Error(`posts.json has an unexpected slug: ${post.slug}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error(`posts.json has an unexpected date for ${post.slug}: ${post.date}`);
    const sections = Array.isArray(post.tree)
      ? post.tree.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.t === 'string').map((entry) => ({ id: entry.id, title: entry.t.trim() }))
      : [];
    return {
      slug: post.slug,
      title: post.title.trim(),
      date: post.date,
      tag: typeof post.tag === 'string' ? post.tag : '',
      minutes: Number.isFinite(post.mins) ? post.mins : null,
      summary: typeof post.summary === 'string' ? post.summary.trim() : '',
      sections,
      url: `${SITE}/blog/${post.slug}/`,
      markdownUrl: `${SITE}/blog/${post.slug}.md`,
    };
  });
  if (!posts.length) throw new Error('posts.json lists no published posts');
  return posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}

/**
 * Collect installable mods from the /mods/ page: names, source links and install commands only.
 */
export function parseMods(html) {
  const mods = new Map();
  const sourcePattern = /href="(https:\/\/github\.com\/anthropics\/(claude-code\/tree\/main\/mods|claude-plugins-community\/tree\/main)\/([A-Za-z0-9._-]+))"/g;
  for (const [, url, group, name] of html.matchAll(sourcePattern)) {
    if (!mods.has(name)) mods.set(name, { name, kind: group.startsWith('claude-code') ? 'built-in' : 'community', source: url, install: null });
  }
  for (const [command, name, marketplace] of html.matchAll(/claude plugin install ([A-Za-z0-9._-]+)@([A-Za-z0-9._-]+)/g)) {
    const entry = mods.get(name) ?? { name, kind: 'community', source: null, install: null };
    entry.install = command;
    entry.marketplace = marketplace;
    mods.set(name, entry);
  }
  return [...mods.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));
}

const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/**
 * Render references/index.md. The output depends only on the posts, so unchanged input gives identical bytes.
 */
export function renderIndex(posts) {
  const lines = [
    '# claude.dev post index',
    '',
    `Generated from ${SITE}/posts.json by \`scripts/detect.mjs\`. Do not edit by hand.`,
    `${posts.length} posts, newest ${posts[0].date}. Titles and section names belong to Anthropic and link to the original posts.`,
    '',
    'Read a post in full with `node scripts/claude-dev.mjs read <slug>` from this skill\'s folder, or open its markdown link.',
    '',
    '| Date | Tag | Post | Min | Sections |',
    '|---|---|---|---|---|',
  ];
  for (const post of posts) {
    const sections = post.sections.map((section) => `[${cell(section.title)}](${post.url}#${section.id})`).join(' · ');
    lines.push(`| ${post.date} | ${cell(post.tag)} | [${cell(post.title)}](${post.url}) · [md](${post.markdownUrl}) · \`${post.slug}\` | ${post.minutes ?? ''} | ${sections} |`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Render references/mods-catalog.md from parseMods output.
 */
export function renderModsCatalog(mods) {
  const lines = [
    '# Claude Code mods listed on claude.dev',
    '',
    `Generated from ${SITE}/mods/ by \`scripts/detect.mjs\`. Do not edit by hand. What mods are and how to build one: \`mods.md\`.`,
    '',
    'Never install a mod on the user\'s behalf without asking; a mod runs code inside their Claude Code session.',
    '',
    '| Mod | Kind | Source | Install |',
    '|---|---|---|---|',
  ];
  for (const mod of mods) {
    lines.push(`| \`${cell(mod.name)}\` | ${mod.kind} | ${mod.source ? `[source](${mod.source})` : ''} | ${mod.install ? `\`${cell(mod.install)}\`` : 'ships with Claude Code'} |`);
  }
  if (!mods.length) lines.push('| none found | | | |');
  return `${lines.join('\n')}\n`;
}

/**
 * Slugs present in a rendered index file.
 */
export function indexedSlugs(markdown) {
  return new Set([...markdown.matchAll(/\]\(https:\/\/claude\.dev\/blog\/([a-z0-9-]+)\/\)/g)].map((match) => match[1]));
}

/**
 * The installed release, when an installer recorded one, and the latest published release of this skill.
 */
export async function releaseStatus({ marker = RELEASE_MARKER, fetchImpl = globalThis.fetch } = {}) {
  if (!fs.existsSync(marker)) return null;
  const installed = fs.readFileSync(marker, 'utf8').trim();
  const response = await fetchImpl(`https://github.com/${REPOSITORY}/releases/latest`, { method: 'HEAD', redirect: 'manual', headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
  const latest = /\/releases\/tag\/([^/?#]+)$/.exec(response.headers.get('location') ?? '')?.[1] ?? null;
  return { installed, latest, behind: Boolean(latest && installed && latest !== installed) };
}

function readBundledIndex() {
  return fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : '';
}

async function livePosts() {
  return parsePosts((await fetchText(`${SITE}/posts.json`)).text);
}

const line = (post) => `${post.date}  ${post.tag.padEnd(11)}  ${post.slug}\n  ${post.title}${post.summary ? ` | ${post.summary}` : ''}\n  ${post.markdownUrl}`;

async function main(argv) {
  const [command = 'help', ...rest] = argv;
  if (command === 'index') {
    for (const post of await livePosts()) process.stdout.write(`${line(post)}\n`);
    return;
  }
  if (command === 'whatsnew') {
    const known = indexedSlugs(readBundledIndex());
    const fresh = (await livePosts()).filter((post) => !known.has(post.slug));
    if (!fresh.length) process.stdout.write(`No posts newer than this skill's index (${known.size} indexed).\n`);
    else {
      process.stdout.write(`${fresh.length} post(s) on claude.dev are not in this skill's notes yet. Read them before relying on the notes:\n`);
      for (const post of fresh) process.stdout.write(`${line(post)}\n`);
    }
    const release = await releaseStatus().catch(() => null);
    if (release?.behind) process.stdout.write(`This copy is ${release.installed}; release ${release.latest} is out. Ask the user before updating the skill.\n`);
    return;
  }
  if (command === 'read') {
    const slug = rest[0];
    if (!slug || !SLUG.test(slug)) throw new Error('usage: claude-dev.mjs read <slug>');
    process.stdout.write((await fetchText(`${SITE}/blog/${slug}.md`)).text);
    return;
  }
  if (command === 'search') {
    const terms = rest.join(' ').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) throw new Error('usage: claude-dev.mjs search <words>');
    const hits = (await livePosts()).filter((post) => {
      const haystack = [post.title, post.summary, post.tag, ...post.sections.map((section) => section.title)].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    if (!hits.length) process.stdout.write('No matching posts.\n');
    for (const post of hits) process.stdout.write(`${line(post)}\n`);
    return;
  }
  process.stdout.write([
    'Usage: node scripts/claude-dev.mjs <command>',
    '  whatsnew        posts on claude.dev that are newer than this skill\'s notes',
    '  index           every post, newest first, read live from claude.dev',
    '  search <words>  posts whose title, summary or section names contain all words',
    '  read <slug>     print one post as markdown',
    '',
  ].join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    const hint = error.message.startsWith('usage:') ? '' : `\nIf the network is blocked here, fetch ${SITE}/llms.txt with your web tool instead.`;
    process.stderr.write(`${error.message}${hint}\n`);
    process.exitCode = 1;
  });
}
