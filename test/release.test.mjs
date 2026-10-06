import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MANIFESTS, bump, checkInstallerContract, latestTag, measure, nextVersion, pluginArchivePaths, pushTag, releaseNotes, validate, zipEntries } from '../scripts/release.mjs';

const COPY = ['package.json', 'plugin.json', 'gemini-extension.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', 'web-card.json', 'assets', 'skills', 'data', '.agents', '.claude-plugin', '.codex-plugin', '.github/workflows/update.yml'];

function copyRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-release-'));
  for (const file of COPY) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.cpSync(new URL(`../${file}`, import.meta.url), path.join(root, file), { recursive: true });
  }
  return root;
}

const readJson = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const writeJson = (root, file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2));

test('release notes select exactly one version', () => {
  const changelog = '# Changelog\r\n\r\n## [0.2.0] - 2026-10-07\r\n\r\n### Added\r\n- New note.\r\n\r\n## [0.1.0]\r\n\r\n- Initial.\r\n';
  assert.equal(releaseNotes(changelog, '0.2.0'), '### Added\r\n- New note.');
  assert.equal(releaseNotes(changelog, '0.1.0'), '- Initial.');
  assert.throws(() => releaseNotes(changelog, '0.3.0'));
  assert.throws(() => releaseNotes(`${changelog}\n## [0.2.0]\nDuplicate`, '0.2.0'));
  assert.throws(() => releaseNotes('## [0.1.0]\n\n', '0.1.0'));
});

test('versions bump by level', () => {
  assert.equal(nextVersion('0.1.9'), '0.1.10');
  assert.equal(nextVersion('0.1.9', 'minor'), '0.2.0');
  assert.equal(nextVersion('0.1.9', 'major'), '1.0.0');
  assert.throws(() => nextVersion('0.1.9', 'huge'));
});

test('the repository passes its own release check', () => {
  const { version } = validate();
  assert.equal(validate(undefined, `v${version}`).version, version);
  assert.throws(() => validate(undefined, 'v0.0.0'), /does not match/);
});

test('validation catches manifest drift, bad presentation fields and stale web card numbers', () => {
  const root = copyRepo();
  try {
    for (const file of MANIFESTS) {
      const original = fs.readFileSync(path.join(root, file), 'utf8');
      const data = JSON.parse(original);
      if (file.endsWith('marketplace.json')) data.plugins[0].version = '9.9.9';
      else data.version = '9.9.9';
      writeJson(root, file, data);
      assert.throws(() => validate(root), /does not match/, file);
      fs.writeFileSync(path.join(root, file), original);
    }
    const pkg = readJson(root, 'package.json');
    writeJson(root, 'package.json', { ...pkg, version: '0.2.0-beta.1' });
    assert.throws(() => validate(root), /stable/);
    writeJson(root, 'package.json', { ...pkg, private: false });
    assert.throws(() => validate(root), /private package/);
    writeJson(root, 'package.json', pkg);
    const portable = readJson(root, 'plugin.json');
    const presentation = portable.extensions['com.openai'].interface;
    writeJson(root, 'plugin.json', { ...portable, extensions: { 'com.openai': { interface: { ...presentation, shortDescription: 'x'.repeat(31) } } } });
    assert.throws(() => validate(root), /shortDescription/);
    writeJson(root, 'plugin.json', { ...portable, extensions: { 'com.openai': { interface: { ...presentation, category: 'Games' } } } });
    assert.throws(() => validate(root), /category/);
    writeJson(root, 'plugin.json', { ...portable, extensions: { 'com.openai': { interface: { ...presentation, defaultPrompt: ['Ask @someone'] } } } });
    assert.throws(() => validate(root), /starter prompts/);
    writeJson(root, 'plugin.json', portable);
    const card = readJson(root, 'web-card.json');
    card.en.stats[0].value = '999';
    writeJson(root, 'web-card.json', card);
    assert.throws(() => validate(root), /web-card\.json en stat 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bump adds a changelog entry, syncs every manifest and refreshes the web card', () => {
  const root = copyRepo();
  try {
    const before = readJson(root, 'package.json').version;
    fs.writeFileSync(path.join(root, 'skills/claude-dev-skill/references/extra-note.md'), '# Extra\n');
    const version = bump(root, { level: 'patch', notes: '### New posts on claude.dev\n\n- 2026-10-07 [A title](https://claude.dev/blog/a-title/)', date: '2026-10-07' });
    assert.equal(version, nextVersion(before));
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.indexOf(`## [${version}] - 2026-10-07`) < changelog.indexOf(`## [${before}]`));
    const result = validate(root, `v${version}`);
    assert.match(result.notes, /A title/);
    assert.equal(readJson(root, 'web-card.json').en.stats[2].value, measure(root).notes);
    assert.throws(() => bump(root, { notes: '  ' }), /needs notes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('measured numbers come from the files they describe', () => {
  const values = measure();
  const state = JSON.parse(fs.readFileSync(new URL('../data/source-state.json', import.meta.url), 'utf8'));
  assert.equal(values.posts, String(Object.keys(state.posts).length));
  assert.equal(values.mods, String(state.mods.length));
  assert.equal(values.cadence, '1h');
  assert.equal(values.platforms, '4');
  assert.equal(values.license, 'MIT');
});

test('the plugin archive holds portable inputs only and rejects unsafe files', () => {
  const files = pluginArchivePaths();
  for (const file of ['plugin.json', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', 'skills/claude-dev-skill/SKILL.md', 'assets/claude-code.svg', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.ok(files.includes(file), file);
  for (const file of ['scripts/release.mjs', 'test/release.test.mjs', '.github/workflows/update.yml', 'data/source-state.json']) assert.ok(!files.includes(file), file);
  const root = copyRepo();
  try {
    fs.writeFileSync(path.join(root, 'skills/claude-dev-skill/.env'), 'fixture-only');
    assert.throws(() => pluginArchivePaths(root), /Unsafe plugin input/);
    fs.unlinkSync(path.join(root, 'skills/claude-dev-skill/.env'));
    fs.symlinkSync(os.tmpdir(), path.join(root, 'assets/escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => pluginArchivePaths(root), /symlink/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('release assets satisfy the installer contract or are refused', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-zip-'));
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-dev-dist-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@invalid', ...args], { cwd: repo, stdio: 'pipe' });
  const sha = (name) => createHash('sha256').update(fs.readFileSync(path.join(dist, name))).digest('hex');
  const writeSums = (names) => fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), `${names.map((name) => `${sha(name)}  ${name}`).join('\n')}\n`);
  try {
    fs.mkdirSync(path.join(repo, 'skills/claude-dev-skill'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'skills/claude-dev-skill/SKILL.md'), '---\nname: claude-dev-skill\n---\n');
    fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'fixture');
    git('archive', '--format=zip', '--prefix=claude-dev-skill-v9.9.9/', `--output=${path.join(dist, 'claude-dev-skill-v9.9.9.zip')}`, 'HEAD');
    git('archive', '--format=zip', `--output=${path.join(dist, 'Claude-Dev-Skill-PLUGIN-v9.9.9.zip')}`, 'HEAD', '--', 'README.md');
    git('archive', '--format=zip', `--output=${path.join(dist, 'empty.zip')}`, 'HEAD', '--', 'README.md');
    assert.deepEqual(zipEntries(fs.readFileSync(path.join(dist, 'claude-dev-skill-v9.9.9.zip'))).filter((name) => !name.endsWith('/')).sort(), ['claude-dev-skill-v9.9.9/README.md', 'claude-dev-skill-v9.9.9/skills/claude-dev-skill/SKILL.md']);
    writeSums(['claude-dev-skill-v9.9.9.zip', 'Claude-Dev-Skill-PLUGIN-v9.9.9.zip']);
    assert.equal(checkInstallerContract(dist), 'claude-dev-skill-v9.9.9.zip');
    writeSums(['claude-dev-skill-v9.9.9.zip', 'empty.zip']);
    assert.throws(() => checkInstallerContract(dist), /exactly one skill zip, found 2/);
    writeSums(['empty.zip']);
    assert.throws(() => checkInstallerContract(dist), /has no skills\/claude-dev-skill\/SKILL\.md/);
    fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), `${'0'.repeat(64)}  claude-dev-skill-v9.9.9.zip\n`);
    assert.throws(() => checkInstallerContract(dist), /does not match SHA256SUMS/);
    assert.throws(() => zipEntries(Buffer.from('not a zip')), /Not a zip archive/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(dist, { recursive: true, force: true });
  }
});

test('latestTag reads the tag that releases/latest redirects to', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options.method, options.redirect]);
    return { headers: new Headers({ location: 'https://github.com/o/r/releases/tag/v1.2.3' }) };
  };
  assert.equal(await latestTag('o/r', { fetchImpl }), 'v1.2.3');
  assert.deepEqual(calls, [['https://github.com/o/r/releases/latest', 'HEAD', 'manual']]);
  assert.equal(await latestTag('o/r', { fetchImpl: async () => ({ headers: new Headers() }) }), null);
});

test('pushTag retries, notices a tag that already arrived, and falls back to the API', async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  const fail = (message) => { const error = new Error(message); error.stderr = `! [remote rejected] v1 -> v1 (${message})`; throw error; };
  const script = (steps) => {
    const calls = [];
    return { calls, run: (command, args) => { calls.push(`${command} ${args.join(' ')}`); const step = steps.shift(); return typeof step === 'function' ? step() : step ?? ''; } };
  };
  let probe = script([() => fail('failed'), '', () => fail('failed'), '', '']);
  assert.equal(await pushTag('v1', { run: probe.run, wait, repo: 'o/r' }), 'Pushed v1 on attempt 3');
  assert.deepEqual(waits, [10000, 20000]);
  probe = script([() => fail('failed'), 'abc\trefs/tags/v1']);
  assert.equal(await pushTag('v1', { run: probe.run, wait, repo: 'o/r' }), 'v1 reached origin on attempt 1');
  probe = script([() => fail('failed'), '', () => fail('failed'), '', 'deadbeef\n', '{}']);
  assert.match(await pushTag('v1', { run: probe.run, wait, attempts: 2, repo: 'o/r' }), /^Created v1 through the API after git failed: ! \[remote rejected\] v1 -> v1 \(failed\)/);
  assert.equal(probe.calls.at(-1), 'gh api repos/o/r/git/refs -f ref=refs/tags/v1 -f sha=deadbeef');
  probe = script([() => fail('failed'), '']);
  await assert.rejects(pushTag('v1', { run: probe.run, wait, attempts: 1, repo: '' }), /Could not push v1/);
});
