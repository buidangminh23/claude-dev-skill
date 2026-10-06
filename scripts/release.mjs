#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.RELEASE_ROOT ? path.resolve(process.env.RELEASE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NAME = 'claude-dev-skill';
export const MANIFESTS = ['plugin.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.codex-plugin/plugin.json', 'gemini-extension.json'];
const PLUGIN_PAYLOAD = ['plugin.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'skills', 'assets', '.claude-plugin', '.codex-plugin'];
const RELEASE_INPUTS = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'web-card.json', 'skills', 'assets', '.agents', 'gemini-extension.json', ...MANIFESTS];
const CATEGORY = 'Developer Tools';
const readJson = (base, file) => JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'));
const writeJson = (base, file, data) => fs.writeFileSync(path.join(base, file), `${JSON.stringify(data, null, 2)}\n`);

export function pluginArchivePaths(base = ROOT) {
  const visit = (relative) => {
    if (/(?:^|\/)(?:\.env(?:\.[^/]*)?|node_modules|[^/]*\.(?:pem|key))(?:\/|$)/i.test(relative)) throw new Error(`Unsafe plugin input: ${relative}`);
    const info = fs.lstatSync(path.join(base, relative));
    if (info.isSymbolicLink()) throw new Error(`Plugin payload cannot contain a symlink: ${relative}`);
    if (info.isDirectory()) return fs.readdirSync(path.join(base, relative)).flatMap((name) => visit(`${relative}/${name}`));
    if (!info.isFile()) throw new Error(`Unsafe plugin input: ${relative}`);
    return [relative];
  };
  return PLUGIN_PAYLOAD.flatMap(visit).sort();
}

export function releaseNotes(changelog, version) {
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\][^\r\n]*\r?\n([\s\S]*?)(?=^## \[|(?![\s\S]))/gm)];
  const matches = sections.filter((entry) => entry[1] === version);
  if (matches.length !== 1 || !matches[0][2].trim()) throw new Error(`Expected one nonempty changelog entry for ${version}`);
  return matches[0][2].trim();
}

/**
 * Numbers shown on the web card, each derived from a file in the repository.
 */
export function measure(base = ROOT) {
  const state = readJson(base, 'data/source-state.json');
  const references = fs.readdirSync(path.join(base, `skills/${NAME}/references`)).filter((name) => name.endsWith('.md') && !['index.md', 'mods-catalog.md'].includes(name));
  const workflow = fs.readFileSync(path.join(base, '.github/workflows/update.yml'), 'utf8');
  const cron = /cron:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(workflow)?.[1];
  const hourly = cron && /^\d{1,2} \* \* \* \*$/.test(cron);
  const platforms = [['.claude-plugin/plugin.json'], ['.codex-plugin/plugin.json'], ['gemini-extension.json'], ['.agents/plugins/marketplace.json']].filter(([file]) => fs.existsSync(path.join(base, file))).length;
  return {
    posts: String(Object.keys(state.posts).length),
    mods: String(state.mods.length),
    notes: String(references.length),
    cadence: hourly ? '1h' : 'manual',
    platforms: String(platforms),
    license: 'MIT',
  };
}

const STAT_ORDER = ['posts', 'mods', 'notes', 'cadence', 'platforms', 'license'];

export function syncWebCard(base = ROOT) {
  const card = readJson(base, 'web-card.json');
  const values = measure(base);
  for (const language of ['vi', 'en']) STAT_ORDER.forEach((key, index) => { card[language].stats[index].value = values[key]; });
  writeJson(base, 'web-card.json', card);
  return values;
}

export function validate(base = ROOT, tag) {
  const pkg = readJson(base, 'package.json');
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Use a stable major.minor.patch version');
  if (pkg.name !== NAME || pkg.private !== true) throw new Error(`Expected private package named ${NAME}`);
  if (tag && tag !== `v${pkg.version}`) throw new Error(`Tag ${tag} does not match v${pkg.version}`);
  for (const file of RELEASE_INPUTS) if (!fs.existsSync(path.join(base, file))) throw new Error(`Missing release input: ${file}`);
  for (const file of MANIFESTS) {
    const data = readJson(base, file);
    const version = file.endsWith('marketplace.json') ? data.plugins.find((plugin) => plugin.name === NAME)?.version : data.version;
    if (version !== pkg.version) throw new Error(`${file}: ${version} does not match ${pkg.version}`);
  }
  const portable = readJson(base, 'plugin.json');
  if (portable.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' || portable.name !== NAME || portable.author?.url !== 'https://github.com/buidangminh23') throw new Error('Invalid portable plugin identity');
  const presentation = portable.extensions?.['com.openai']?.interface;
  for (const [field, limit] of [['displayName', 30], ['shortDescription', 30], ['longDescription', 4000], ['developerName', 80]]) {
    const value = presentation?.[field];
    if (typeof value !== 'string' || !value.trim() || value.length > limit || (field !== 'longDescription' && /[\r\n]/.test(value))) throw new Error(`Invalid public plugin ${field}`);
  }
  if (presentation.category !== CATEGORY) throw new Error(`Plugin category must be ${CATEGORY}`);
  for (const field of ['logo', 'composerIcon']) {
    const image = presentation[field];
    if (typeof image !== 'string' || !image.startsWith('./assets/') || image.includes('..') || !fs.existsSync(path.join(base, image))) throw new Error(`Plugin ${field} must be bundled inside assets`);
  }
  const prompts = presentation.defaultPrompt;
  if (!Array.isArray(prompts) || !prompts.length || prompts.length > 3 || prompts.some((value) => typeof value !== 'string' || !value.trim() || value.length > 128 || /[\r\n@]/.test(value))) throw new Error('Invalid public plugin starter prompts');
  const codex = readJson(base, '.codex-plugin/plugin.json');
  if (codex.skills !== './skills/') throw new Error('Codex manifest must point at ./skills/');
  const gemini = readJson(base, 'gemini-extension.json');
  if (!fs.existsSync(path.join(base, gemini.contextFileName))) throw new Error('Gemini context file is missing');
  pluginArchivePaths(base);
  const changelog = fs.readFileSync(path.join(base, 'CHANGELOG.md'), 'utf8');
  if (changelog.match(/^## \[([^\]]+)\]/m)?.[1] !== pkg.version) throw new Error('Latest changelog entry must match package.json');
  const notes = releaseNotes(changelog, pkg.version);
  const skill = fs.readFileSync(path.join(base, `skills/${NAME}/SKILL.md`), 'utf8');
  if (!new RegExp(`^---\\r?\\nname: ${NAME}\\r?\\n`).test(skill)) throw new Error('SKILL.md must start with frontmatter naming the skill');
  const card = readJson(base, 'web-card.json');
  const values = measure(base);
  for (const language of ['vi', 'en']) {
    const stats = card[language]?.stats;
    if (!Array.isArray(stats) || stats.length !== 6) throw new Error(`web-card.json ${language} needs exactly 6 stats`);
    STAT_ORDER.forEach((key, index) => {
      if (stats[index].value !== values[key]) throw new Error(`web-card.json ${language} stat ${index + 1} is ${stats[index].value}, measured ${values[key]}; run node scripts/release.mjs stats`);
    });
  }
  return { version: pkg.version, notes };
}

export function nextVersion(version, level = 'patch') {
  const [major, minor, patch] = version.split('.').map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump level: ${level}`);
}

export function syncManifests(base = ROOT) {
  const { version } = readJson(base, 'package.json');
  for (const file of MANIFESTS) {
    const data = readJson(base, file);
    if (file.endsWith('marketplace.json')) data.plugins.find((plugin) => plugin.name === NAME).version = version;
    else data.version = version;
    writeJson(base, file, data);
  }
  return version;
}

/**
 * Raise the version, add a CHANGELOG entry above the previous one, and refresh manifests and web-card numbers.
 */
export function bump(base = ROOT, { level = 'patch', notes, date = new Date().toISOString().slice(0, 10) } = {}) {
  if (!notes || !notes.trim()) throw new Error('A release needs notes');
  const pkg = readJson(base, 'package.json');
  pkg.version = nextVersion(pkg.version, level);
  writeJson(base, 'package.json', pkg);
  const file = path.join(base, 'CHANGELOG.md');
  const changelog = fs.readFileSync(file, 'utf8');
  const first = changelog.search(/^## \[/m);
  const entry = `## [${pkg.version}] - ${date}\n\n${notes.trim()}\n\n`;
  fs.writeFileSync(file, first === -1 ? `${changelog.trimEnd()}\n\n${entry}` : `${changelog.slice(0, first)}${entry}${changelog.slice(first)}`);
  syncManifests(base);
  syncWebCard(base);
  return pkg.version;
}

/**
 * File names in a zip archive, read from its central directory. Enough for archives written by git archive.
 */
export function zipEntries(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end === -1) throw new Error('Not a zip archive');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt zip central directory');
    const nameLength = buffer.readUInt16LE(offset + 28);
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return names;
}

/**
 * The contract the owner's installers rely on: SHA256SUMS lists exactly one zip without "plugin" in its name, its
 * hash matches, and it holds skills/<name>/SKILL.md at the root or one folder down.
 */
export function checkInstallerContract(dir) {
  const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map((line) => /^([0-9a-f]{64})  (\S+)$/.exec(line));
  if (sums.some((match) => !match)) throw new Error('SHA256SUMS.txt has a malformed line');
  const skillZips = sums.filter(([, , name]) => name.endsWith('.zip') && !name.toLowerCase().includes('plugin'));
  if (skillZips.length !== 1) throw new Error(`SHA256SUMS.txt must list exactly one skill zip, found ${skillZips.length}`);
  for (const [, hash, name] of sums) {
    if (createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex') !== hash) throw new Error(`${name} does not match SHA256SUMS.txt`);
  }
  const entries = zipEntries(fs.readFileSync(path.join(dir, skillZips[0][2])));
  const skillFile = new RegExp(`^(?:[^/]+/)?skills/${NAME}/SKILL\\.md$`);
  if (!entries.some((entry) => skillFile.test(entry))) throw new Error(`${skillZips[0][2]} has no skills/${NAME}/SKILL.md at its root or one folder down`);
  return skillZips[0][2];
}

function pack(tag) {
  const { version } = validate(ROOT, tag);
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: ROOT, encoding: 'utf8' });
  if (dirty.trim()) throw new Error('Commit all release inputs before packaging HEAD');
  const dist = path.join(ROOT, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
  const skillZip = `${NAME}-v${version}.zip`;
  execFileSync('git', ['archive', '--format=zip', `--prefix=${NAME}-v${version}/`, `--output=${path.join(dist, skillZip)}`, 'HEAD'], { cwd: ROOT });
  const pluginZip = `${NAME}-plugin-v${version}.zip`;
  execFileSync('git', ['archive', '--format=zip', `--output=${path.join(dist, pluginZip)}`, 'HEAD', '--', ...pluginArchivePaths()], { cwd: ROOT });
  const sums = [skillZip, pluginZip].map((name) => `${createHash('sha256').update(fs.readFileSync(path.join(dist, name))).digest('hex')}  ${name}`).join('\n');
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), `${sums}\n`);
  checkInstallerContract(dist);
  process.stdout.write(`${path.join(dist, skillZip)}\n${path.join(dist, pluginZip)}\n`);
}

const gh = (args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Push a local tag to origin. GitHub has rejected a job-token tag push once with a bare "(failed)" that could not be
 * reproduced, so retry with backoff, stop as soon as the tag is on the remote, and fall back to the git refs API.
 */
export async function pushTag(tag, { run = runCommand, wait = sleep, attempts = 4, repo = process.env.GITHUB_REPOSITORY } = {}) {
  const errors = [];
  const onRemote = () => {
    try {
      return run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).trim() !== '';
    } catch {
      return false;
    }
  };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1 && onRemote()) return `${tag} reached origin on attempt ${attempt - 1}`;
    try {
      run('git', ['push', 'origin', `refs/tags/${tag}`]);
      return `Pushed ${tag} on attempt ${attempt}`;
    } catch (error) {
      errors.push(String(error.stderr || error.message).trim().split('\n').slice(-1)[0]);
      if (attempt < attempts) await wait(10000 * 2 ** (attempt - 1));
    }
  }
  if (onRemote()) return `${tag} reached origin after ${attempts} attempts`;
  if (!repo) throw new Error(`Could not push ${tag}: ${errors.join(' | ')}`);
  const sha = run('git', ['rev-parse', `${tag}^{commit}`]).trim();
  run('gh', ['api', `repos/${repo}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${sha}`]);
  return `Created ${tag} through the API after git failed: ${errors.join(' | ')}`;
}

const runCommand = (command, args) => execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * The tag that https://github.com/<repo>/releases/latest redirects to, the same lookup the installers make.
 */
export async function latestTag(repo, { fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`https://github.com/${repo}/releases/latest`, { method: 'HEAD', redirect: 'manual' });
  return /\/releases\/tag\/([^/?#]+)$/.exec(response.headers.get('location') ?? '')?.[1] ?? null;
}

/**
 * Build the release assets for tag, upload them to a draft, download them again to check the installer contract,
 * then mark the release latest and wait until releases/latest redirects to it. An existing published release is
 * only verified, so rerunning a workflow never replaces published files.
 */
async function publish(tag) {
  pack(tag);
  const { notes } = validate(ROOT, tag);
  const dist = path.join(ROOT, 'dist');
  const notesFile = path.join(dist, 'release-notes.md');
  fs.writeFileSync(notesFile, `${notes}\n`);
  const assets = fs.readdirSync(dist).filter((name) => name.endsWith('.zip') || name === 'SHA256SUMS.txt').map((name) => path.join(dist, name));
  const view = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft'], { cwd: ROOT, encoding: 'utf8' });
  if (view.status !== 0) gh(['release', 'create', tag, '--verify-tag', '--draft', '--title', tag, '--notes-file', notesFile, ...assets]);
  else if (JSON.parse(view.stdout).isDraft) gh(['release', 'upload', tag, ...assets, '--clobber']);
  const downloaded = fs.mkdtempSync(path.join(os.tmpdir(), `${NAME}-release-`));
  try {
    gh(['release', 'download', tag, '--dir', downloaded]);
    if (fs.readFileSync(path.join(downloaded, 'SHA256SUMS.txt'), 'utf8') !== fs.readFileSync(path.join(dist, 'SHA256SUMS.txt'), 'utf8')) {
      throw new Error(`${tag} holds different assets than this build; refusing to replace them`);
    }
    checkInstallerContract(downloaded);
  } finally {
    fs.rmSync(downloaded, { recursive: true, force: true });
  }
  if (JSON.parse(gh(['release', 'view', tag, '--json', 'isDraft'])).isDraft) gh(['release', 'edit', tag, '--draft=false', '--latest']);
  const repo = process.env.GITHUB_REPOSITORY || `buidangminh23/${NAME}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if ((await latestTag(repo)) === tag) return `Published ${tag}; releases/latest points to it and the assets pass the installer contract`;
    await sleep(5000);
  }
  throw new Error(`${tag} is published, but https://github.com/${repo}/releases/latest does not redirect to it`);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main(argv) {
  const [command = 'check', ...rest] = argv;
  const tag = rest[0] && !rest[0].startsWith('--') ? rest[0] : undefined;
  if (command === 'check') process.stdout.write(`Validated v${validate(ROOT, tag).version}\n`);
  else if (command === 'notes') process.stdout.write(`${validate(ROOT, tag).notes}\n`);
  else if (command === 'pack') pack(tag);
  else if (command === 'publish') process.stdout.write(`${await publish(tag)}\n`);
  else if (command === 'push-tag') {
    if (!tag) throw new Error('usage: release.mjs push-tag <tag>');
    process.stdout.write(`${await pushTag(tag)}\n`);
  }
  else if (command === 'sync') process.stdout.write(`Manifests at v${syncManifests()}\n`);
  else if (command === 'stats') process.stdout.write(`${JSON.stringify(syncWebCard())}\n`);
  else if (command === 'bump') {
    const notesFile = option(rest, '--notes-file');
    const notes = notesFile ? fs.readFileSync(notesFile, 'utf8') : option(rest, '--notes');
    process.stdout.write(`${bump(ROOT, { level: tag ?? 'patch', notes, date: option(rest, '--date') })}\n`);
  } else throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
