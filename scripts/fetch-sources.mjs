#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, fetchText, parsePosts } from '../skills/claude-dev-skill/scripts/claude-dev.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NOTES_DIR = 'skills/claude-dev-skill/references';
const GENERATED = new Set(['index.md', 'mods-catalog.md']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * Visible text of an HTML or RSS fragment: scripts, styles, CDATA markers and tags removed, common entities decoded.
 */
export function htmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!\[CDATA\[|\]\]>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#39|[a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/**
 * Download the corpus the guard compares notes against: every published post's markdown, plus the post
 * summaries and descriptions from posts.json, the RSS item descriptions and the text of the mods page. The files
 * are working copies for the guard and the distillation step and must never be committed.
 */
export async function fetchSources(dir, { fetchImpl } = {}) {
  const raw = (await fetchText(`${SITE}/posts.json`, { fetchImpl })).text;
  const posts = parsePosts(raw);
  fs.mkdirSync(dir, { recursive: true });
  for (const post of posts) {
    const { text } = await fetchText(post.markdownUrl, { fetchImpl });
    fs.writeFileSync(path.join(dir, `${post.slug}.md`), text);
  }
  const blurbs = JSON.parse(raw).posts.filter((post) => post && post.draft !== true).map((post) => [post.title, post.summary, post.description].filter((value) => typeof value === 'string' && value.trim()).join('\n'));
  fs.writeFileSync(path.join(dir, '_posts-json.md'), `${blurbs.join('\n\n')}\n`);
  const rss = (await fetchText(`${SITE}/rss.xml`, { fetchImpl })).text;
  const items = [...rss.matchAll(/<description>([\s\S]*?)<\/description>/g)].map((match) => htmlText(match[1]));
  fs.writeFileSync(path.join(dir, '_rss.md'), `${items.join('\n\n')}\n`);
  fs.writeFileSync(path.join(dir, '_mods.md'), `${htmlText((await fetchText(`${SITE}/mods/`, { fetchImpl })).text)}\n`);
  return posts;
}

/**
 * Map each topic note to the post slugs named on its "Sources:" line.
 */
export function noteSources(root = ROOT) {
  const dir = path.join(root, NOTES_DIR);
  const map = new Map();
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.md') && !GENERATED.has(file)).sort()) {
    const line = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').find((row) => row.startsWith('Sources:')) ?? '';
    map.set(name, [...line.matchAll(/https:\/\/claude\.dev\/blog\/([a-z0-9-]+)\//g)].map((match) => match[1]));
  }
  return map;
}

/**
 * The task sheet handed to the distillation step: which posts to process and which notes already cite them.
 */
export function distillTask(posts, slugs, notes, sourceDir) {
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length) throw new Error(`Not on claude.dev: ${unknown.join(', ')}`);
  const citing = (slug) => [...notes].filter(([, sources]) => sources.includes(slug)).map(([name]) => name);
  const lines = ['# Distillation task', '', 'Process every post below. Read its source file in full before editing.', ''];
  for (const slug of slugs) {
    const post = bySlug.get(slug);
    const cited = citing(slug);
    lines.push(`- \`${slug}\`: ${post.title} (${post.date}, ${post.tag || 'untagged'})`);
    lines.push(`  - source: ${path.posix.join(sourceDir, `${slug}.md`)}`);
    lines.push(cited.length ? `  - cited by: ${cited.join(', ')} (update these notes to match the post)` : '  - cited by: none yet (extend the closest note or create a new one)');
  }
  lines.push('', '## Existing notes and the posts they cite', '');
  for (const [name, sources] of notes) lines.push(`- ${name}: ${sources.join(', ') || 'no sources line'}`);
  return `${lines.join('\n')}\n`;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main(argv) {
  const dir = argv[0];
  if (!dir || dir.startsWith('--')) throw new Error('usage: fetch-sources.mjs <dir> [--task <file> --pending <slug,slug>]');
  const posts = await fetchSources(dir);
  process.stdout.write(`Fetched ${posts.length} posts into ${dir}\n`);
  const taskFile = option(argv, '--task');
  if (taskFile) {
    const slugs = (option(argv, '--pending') ?? '').split(',').map((slug) => slug.trim()).filter(Boolean);
    if (!slugs.length) throw new Error('--task needs --pending with at least one slug');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, distillTask(posts, slugs, noteSources(), dir.split(path.sep).join('/')));
    process.stdout.write(`Wrote ${taskFile} for ${slugs.length} post(s)\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
