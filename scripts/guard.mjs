#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { fetchSources as downloadSources } from './fetch-sources.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_NAME = 'claude-dev-skill';
export const SKILL_DIR = `skills/${SKILL_NAME}`;
export const GENERATED = new Set([`${SKILL_DIR}/references/index.md`, `${SKILL_DIR}/references/mods-catalog.md`]);
export const LIMITS = { skill: 8192, reference: 16384, generated: 40960, folder: 204800, description: 520 };
export const NGRAM = 12;
export const SHORT = 6;
export const CONTAINMENT_LIMIT = 0.06;
const FRONTMATTER_KEYS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata']);
const ALLOWED_HOSTS = new Set([
  'claude.dev',
  'code.claude.com',
  'platform.claude.com',
  'docs.claude.com',
  'support.claude.com',
  'claude.com',
  'www.anthropic.com',
  'anthropic.com',
  'docs.anthropic.com',
  'agentskills.io',
]);
const ALLOWED_GITHUB_PREFIXES = ['/anthropics/', `/buidangminh23/${SKILL_NAME}`];
const DEFAULT_SCOPE = [`${SKILL_DIR}/references/`, `${SKILL_DIR}/SKILL.md`];
const EDITABLE_SECTIONS = new Set(['Pick the note', 'Principles shared across the posts']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.cache']);

const fail = (check, file, message) => ({ check, file, message });

/**
 * Split SKILL.md frontmatter into key/value pairs. Only the flat `key: value` form is accepted.
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) return { invalid: line };
    fields[pair[1]] = pair[2].replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return fields;
}

export function checkFrontmatter(text, folderName = SKILL_NAME) {
  const fields = parseFrontmatter(text);
  if (!fields) return [fail('frontmatter', 'SKILL.md', 'missing --- frontmatter block')];
  if (fields.invalid) return [fail('frontmatter', 'SKILL.md', `unsupported line: ${fields.invalid}`)];
  const problems = [];
  if (fields.name !== folderName) problems.push(fail('frontmatter', 'SKILL.md', `name must be ${folderName}`));
  if (!fields.description) problems.push(fail('frontmatter', 'SKILL.md', 'description is empty'));
  else if (fields.description.length > LIMITS.description) problems.push(fail('frontmatter', 'SKILL.md', `description is ${fields.description.length} characters, limit ${LIMITS.description}`));
  for (const key of Object.keys(fields)) if (!FRONTMATTER_KEYS.has(key)) problems.push(fail('frontmatter', 'SKILL.md', `key ${key} is not portable`));
  return problems;
}

/**
 * Lowercased word tokens. URLs, link targets, punctuation and markdown syntax are dropped, so formatting cannot hide
 * a copied run and a link to a post is never mistaken for its text.
 */
export function tokens(text) {
  return tokenLines(text).words;
}

/**
 * Tokens plus the 1-based line each token came from, so findings can point at a line without quoting text.
 */
export function tokenLines(text) {
  const words = [];
  const lines = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const prose = line.replace(/\]\([^)\s]*\)/g, '] ').replace(/https?:\/\/[^\s<>()\[\]"'`]+/g, ' ');
    for (const word of prose.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []) {
      words.push(word);
      lines.push(index + 1);
    }
  });
  return { words, lines };
}

export function shingles(text, size = NGRAM) {
  const words = tokens(text);
  const set = new Set();
  for (let index = 0; index + size <= words.length; index += 1) set.add(words.slice(index, index + size).join(' '));
  return set;
}

/**
 * Report every run of `size` or more consecutive words that a note shares with any source, by line and length.
 */
export function findOverlaps(noteText, sources, size = NGRAM) {
  const { words, lines } = tokenLines(noteText);
  const hits = [];
  let lastEnd = -1;
  for (let index = 0; index + size <= words.length; index += 1) {
    const gram = words.slice(index, index + size).join(' ');
    for (const [name, set] of sources) {
      if (!set.has(gram)) continue;
      if (index <= lastEnd) hits[hits.length - 1].end = index + size;
      else hits.push({ source: name, start: index, end: index + size });
      lastEnd = index + size - 1;
      break;
    }
  }
  return hits.map((hit) => ({
    source: hit.source,
    line: lines[hit.start],
    words: hit.end - hit.start,
    excerpt: words.slice(hit.start, Math.min(hit.end, hit.start + 24)).join(' '),
  }));
}

/**
 * Share of a note's SHORT-word sequences that also occur somewhere in the corpus. Catches close paraphrase that
 * never reaches a full NGRAM-word run.
 */
export function containment(noteText, corpus, size = SHORT) {
  const words = tokens(noteText);
  let total = 0;
  let shared = 0;
  for (let index = 0; index + size <= words.length; index += 1) {
    total += 1;
    if (corpus.has(words.slice(index, index + size).join(' '))) shared += 1;
  }
  return total ? shared / total : 0;
}

export function extractUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s<>()\[\]"'`|]+/g)].map((match) => match[0].replace(/[.,;:!?*_]+$/, ''));
}

export function checkUrl(raw, knownSlugs) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return `malformed URL ${raw}`;
  }
  if (url.protocol !== 'https:') return `non-https URL ${raw}`;
  if (url.hostname === 'github.com') {
    return ALLOWED_GITHUB_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ? null : `GitHub link outside the allowlist: ${raw}`;
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) return `host ${url.hostname} is not on the allowlist`;
  if (url.hostname === 'claude.dev' && knownSlugs && url.pathname.startsWith('/blog/') && url.pathname !== '/blog/') {
    const blog = /^\/blog\/([a-z0-9-]+)(?:\/|\.md)?$/.exec(url.pathname);
    if (!blog || !knownSlugs.has(blog[1])) return `link to a post that is not in the index: ${raw}`;
  }
  return null;
}

const RISKY_PATTERNS = [
  ['pipes a download into a shell', /\b(?:curl|wget|irm|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b|\|\s*iex\b/i],
  ['deletes recursively', /\brm\s+-[a-z]*(?:rf|fr)[a-z]*\s+[^\s`'",;)]|\bRemove-Item\s+[^\n`]*-Recurse/i],
  ['asks for root', /\bsudo\s+[a-z]/],
  ['skips permission checks', /--dangerously-skip-permissions|\bbypassPermissions\b|--permission-mode[ =]bypass/i],
  ['decodes a hidden payload', /\bbase64\s+(?:-d|--decode)\b|\bFromBase64String\b|\batob\(/],
  ['installs software globally', /\b(?:npm|pnpm|yarn)\s+(?:i|install|add)\s+(?:-g|--global)\b|\bpip3?\s+install\b|\bbrew\s+install\b|\bcargo\s+install\b/],
  ['runs code without asking', /\bnpx\s+(?:-y|--yes)\b|\beval\s*\(/],
];

/**
 * Instructions an attacker would plant in a skill. Notes give judgment, not commands to run unasked, so any match
 * stops the release for a person to review.
 */
export function riskyInstructions(text) {
  return RISKY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

/**
 * Markdown links that point at files instead of URLs, resolved against the file that holds them.
 */
export function relativeLinks(text) {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target))
    .map((target) => target.replace(/[#?].*$/, ''))
    .filter(Boolean);
}

/**
 * SKILL.md with the parts the distillation may change blanked out: the description and the bodies of the note table
 * and the principles. Everything else, headings included, must stay byte-identical across automated runs.
 */
export function protectedView(text) {
  const out = [];
  let editable = false;
  for (const line of text.replace(/^description:.*$/m, 'description:').split('\n')) {
    const heading = /^## (.+?)\s*$/.exec(line);
    if (heading) editable = EDITABLE_SECTIONS.has(heading[1]);
    if (heading || !editable) out.push(line);
  }
  return out.join('\n');
}

const SECRET_PATTERNS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const PERSONAL_PATTERNS = [
  ['home path', /(?:\/Users\/[A-Za-z][\w.-]*|\/home\/(?!runner\b)[a-z][\w.-]*\/|[A-Za-z]:\\Users\\)/],
  ['phone number', /(?<![\w.-])(?:\+84|0)\d{9}(?![\w.-])/],
  ['email address', /[\w.+-]+@(?!users\.noreply\.github\.com|anthropic\.com\b)[\w-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\b/i],
];

export function scanText(text) {
  const found = [];
  for (const [label, pattern] of [...SECRET_PATTERNS, ...PERSONAL_PATTERNS]) if (pattern.test(text)) found.push(label);
  return found;
}

function listFiles(root, relative = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, child));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const isText = (file) => /\.(?:md|mjs|js|json|ya?ml|txt|svg)$/.test(file) || ['LICENSE', '.gitignore', '.gitattributes'].includes(path.basename(file));

/**
 * Post titles recorded in the state file. Notes may cite a title verbatim, so overlap checks blank them out first.
 */
export function knownTitlesFrom(root) {
  const file = path.join(root, 'data/source-state.json');
  if (!fs.existsSync(file)) return [];
  return Object.values(JSON.parse(fs.readFileSync(file, 'utf8')).posts ?? {}).map((post) => post.title).filter((title) => typeof title === 'string' && title.trim());
}

export function stripTitles(text, titles) {
  return [...titles].sort((a, b) => b.length - a.length).reduce((out, title) => out.split(title).join(' '), text);
}

export function knownSlugsFrom(root) {
  const file = path.join(root, 'data/source-state.json');
  if (!fs.existsSync(file)) return null;
  return new Set(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).posts ?? {}));
}

/**
 * Static checks that need no network: frontmatter, sizes, links, secrets and personal data.
 */
export function staticChecks(root = ROOT) {
  const problems = [];
  const skillFile = path.join(root, SKILL_DIR, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return [fail('layout', `${SKILL_DIR}/SKILL.md`, 'missing')];
  const skillText = fs.readFileSync(skillFile, 'utf8');
  problems.push(...checkFrontmatter(skillText));
  const skillFiles = listFiles(root, SKILL_DIR);
  let folderBytes = 0;
  const knownSlugs = knownSlugsFrom(root);
  for (const file of skillFiles) {
    const bytes = fs.statSync(path.join(root, file)).size;
    folderBytes += bytes;
    const limit = file === `${SKILL_DIR}/SKILL.md` ? LIMITS.skill : GENERATED.has(file) ? LIMITS.generated : file.endsWith('.md') ? LIMITS.reference : null;
    if (limit && bytes > limit) problems.push(fail('size', file, `${bytes} bytes, limit ${limit}`));
    if (file.endsWith('.md')) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const url of extractUrls(text)) {
        const problem = checkUrl(url, knownSlugs);
        if (problem) problems.push(fail('links', file, problem));
      }
      for (const target of relativeLinks(text)) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
        if (!resolved.startsWith(`${SKILL_DIR}/`) || !fs.existsSync(path.join(root, resolved))) problems.push(fail('links', file, `relative link must point at an existing file inside the skill: ${target}`));
      }
      if (!GENERATED.has(file)) for (const label of riskyInstructions(text)) problems.push(fail('risky', file, `${label}; a person must review this`));
    }
  }
  if (folderBytes > LIMITS.folder) problems.push(fail('size', SKILL_DIR, `${folderBytes} bytes, limit ${LIMITS.folder}`));
  for (const file of listFiles(root).filter(isText)) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), 'utf8');
    } catch (error) {
      if (error.code === 'EACCES' || error.code === 'EPERM') continue;
      throw error;
    }
    for (const label of scanText(text)) problems.push(fail('secrets', file, `looks like a ${label}`));
  }
  return problems;
}

/**
 * Check every hand-written file in the skill against the corpus: no run of NGRAM words shared with any source, and
 * no more than CONTAINMENT_LIMIT of its SHORT-word sequences found anywhere in the corpus. Findings name the line
 * and the source but never repeat the text, because CI logs and issues are public.
 */
export function overlapChecks(root, texts, { showExcerpts = false } = {}) {
  const long = new Map([...texts].map(([name, text]) => [name, shingles(text, NGRAM)]));
  const corpus = new Set();
  for (const text of texts.values()) for (const gram of shingles(text, SHORT)) corpus.add(gram);
  const problems = [];
  const stats = [];
  const titles = knownTitlesFrom(root);
  for (const file of listFiles(root, SKILL_DIR).filter((name) => name.endsWith('.md') && !GENERATED.has(name))) {
    const text = stripTitles(fs.readFileSync(path.join(root, file), 'utf8'), titles);
    for (const hit of findOverlaps(text, long)) {
      problems.push(fail('verbatim', `${file}:${hit.line}`, `${hit.words} words in a row match ${hit.source}${showExcerpts ? `: "${hit.excerpt}"` : ''}`));
    }
    const share = containment(text, corpus);
    stats.push({ file, containment: Number(share.toFixed(3)) });
    if (share > CONTAINMENT_LIMIT) problems.push(fail('verbatim', file, `${(share * 100).toFixed(1)}% of its ${SHORT}-word sequences appear in the posts, limit ${CONTAINMENT_LIMIT * 100}%`));
  }
  return Object.assign(problems, { stats });
}

/**
 * Files changed against `base`, tracked or new, with how many lines each one adds or removes.
 */
export function changedFiles(root, base) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const entries = new Map();
  for (const record of git('diff', '--numstat', '-z', '--no-renames', base, '--').split('\0').filter(Boolean)) {
    const [added, removed, file] = record.split('\t');
    entries.set(file, { file, lines: (Number(added) || 0) + (Number(removed) || 0), deleted: false });
  }
  for (const file of git('diff', '--name-only', '-z', '--no-renames', '--diff-filter=D', base, '--').split('\0').filter(Boolean)) {
    entries.set(file, { ...(entries.get(file) ?? { file, lines: 0 }), deleted: true });
  }
  for (const file of git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    entries.set(file, { file, lines: (text.match(/\n/g) ?? []).length + (text && !text.endsWith('\n') ? 1 : 0), deleted: false });
  }
  return [...entries.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * What an automated run may change: only notes and SKILL.md, nothing deleted, at most `budget` changed lines, and
 * with `protect` nothing in SKILL.md outside its editable parts.
 */
export function scopeChecks(root, base, allowed = DEFAULT_SCOPE, { budget = null, protect = false } = {}) {
  const inScope = (file) => allowed.some((prefix) => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));
  const problems = [];
  let lines = 0;
  for (const entry of changedFiles(root, base)) {
    if (!inScope(entry.file)) problems.push(fail('scope', entry.file, 'changed outside the allowed paths'));
    else if (entry.deleted) problems.push(fail('scope', entry.file, 'deleted; automated runs may only add or edit notes'));
    lines += entry.lines;
  }
  if (budget !== null && lines > budget) problems.push(fail('scope', SKILL_DIR, `${lines} changed lines, budget ${budget}`));
  if (protect) {
    const relative = `${SKILL_DIR}/SKILL.md`;
    const before = execFileSync('git', ['show', `${base}:${relative}`], { cwd: root, encoding: 'utf8' });
    const after = fs.readFileSync(path.join(root, relative), 'utf8');
    if (protectedView(before) !== protectedView(after)) problems.push(fail('scope', relative, 'changed outside the description, the note table and the principles'));
  }
  return problems;
}

export function loadSourceTexts(dir) {
  const texts = new Map();
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.md')).sort()) {
    texts.set(name.replace(/\.md$/, ''), fs.readFileSync(path.join(dir, name), 'utf8'));
  }
  return texts;
}

export function loadSourceDir(dir, size = NGRAM) {
  return new Map([...loadSourceTexts(dir)].map(([name, text]) => [name, shingles(text, size)]));
}

export async function fetchSourceTexts({ fetchImpl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-sources-'));
  try {
    await downloadSources(dir, { fetchImpl });
    return loadSourceTexts(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = { sources: null, fetch: false, diff: null, allow: [], excerpts: false, budget: null, protect: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--sources') args.sources = argv[++index];
    else if (flag === '--fetch-sources') args.fetch = true;
    else if (flag === '--diff') args.diff = argv[++index];
    else if (flag === '--allow') args.allow.push(argv[++index]);
    else if (flag === '--show-excerpts') args.excerpts = true;
    else if (flag === '--budget') args.budget = Number.parseInt(argv[++index], 10);
    else if (flag === '--protect') args.protect = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (args.budget !== null && !(args.budget > 0)) throw new Error('--budget needs a positive number of lines');
  if ((args.budget !== null || args.protect) && !args.diff) throw new Error('--budget and --protect need --diff <ref>');
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const problems = staticChecks(ROOT);
  let texts = null;
  if (args.sources) texts = loadSourceTexts(args.sources);
  else if (args.fetch) texts = await fetchSourceTexts();
  let stats = [];
  if (texts) {
    const overlap = overlapChecks(ROOT, texts, { showExcerpts: args.excerpts });
    problems.push(...overlap);
    stats = overlap.stats;
  }
  if (args.diff) problems.push(...scopeChecks(ROOT, args.diff, args.allow.length ? args.allow : DEFAULT_SCOPE, { budget: args.budget, protect: args.protect }));
  const checks = ['frontmatter', 'size', 'links', 'risky', 'secrets', ...(texts ? [`verbatim against ${texts.size} sources`] : []), ...(args.diff ? ['scope'] : [])];
  if (stats.length) {
    const worst = stats.reduce((top, item) => (item.containment > top.containment ? item : top));
    process.stdout.write(`Highest ${SHORT}-word containment: ${(worst.containment * 100).toFixed(1)}% in ${worst.file}.\n`);
  }
  if (!problems.length) {
    process.stdout.write(`Guard passed: ${checks.join(', ')}.\n`);
    return;
  }
  for (const problem of problems) process.stderr.write(`[${problem.check}] ${problem.file}: ${problem.message}\n`);
  process.stderr.write(`Guard failed with ${problems.length} problem(s).\n`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
