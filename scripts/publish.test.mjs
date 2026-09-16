import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublishContext, parseDryRun, preflight, registryVersion, selectPackages, verifyPublished } from './publish.mjs';
const repository = { url: 'git+https://github.com/dobreadi/agentfiber-voice.git' };
const voice = { name: '@agentfiber/voice', version: '0.1.3', repository };

test('all publishes voice before its grammar, and individual selections stay narrow', () => {
  assert.deepEqual(selectPackages('all'), ['voice', 'voice-grammar-en', 'asr', 'voice-ui']);
  assert.deepEqual(selectPackages('asr'), ['asr']);
  assert.throws(() => selectPackages('../../other'));
});
test('malformed dry-run values never enable publishing', () => {
  assert.equal(parseDryRun('true'), true);
  assert.equal(parseDryRun('false'), false);
  assert.throws(() => parseDryRun(undefined));
  assert.throws(() => parseDryRun('FALSE'));
});
test('publishing rejects local, fork, and non-main contexts', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'dobreadi/agentfiber-voice', GITHUB_REF: 'refs/heads/main' };
  assert.doesNotThrow(() => assertPublishContext(env));
  for (const key of Object.keys(env)) assert.throws(() => assertPublishContext({ ...env, [key]: 'other' }));
});
test('only registry 404 counts as a missing version', async () => {
  assert.equal(await registryVersion(voice.name, voice.version, async () => new Response('', { status: 404 })), null);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(registryVersion(voice.name, voice.version, async () => new Response('', { status })), /Registry lookup failed/);
  }
});
test('preflight accepts a new patch and rejects existing or backwards releases', async () => {
  await preflight([voice], async (_name, version) => version === 'latest' ? { version: '0.1.2' } : null);
  await assert.rejects(preflight([voice], async () => voice), /already exists/);
  await assert.rejects(preflight([voice], async (_name, version) => version === 'latest' ? { version: '0.2.0' } : null), /backwards/);
});
test('all-selection preflight catches a later package conflict before publication', async () => {
  const grammar = { ...voice, name: '@agentfiber/voice-grammar-en' };
  await assert.rejects(preflight([voice, grammar], async (name, version) => {
    if (name === grammar.name) return grammar;
    return version === 'latest' ? { version: '0.1.2' } : null;
  }), /voice-grammar-en.*already exists/);
});
test('preflight rejects private, unrelated, prerelease, and unknown packages', async () => {
  for (const manifest of [{ ...voice, private: true }, { ...voice, repository: {} }, { ...voice, version: '0.2.0-beta.1' }]) {
    await assert.rejects(preflight([manifest], async () => null));
  }
  await assert.rejects(preflight([voice], async () => null), /Expected existing npm package/);
});
test('verification checks published identity, repository, and exact packed bytes', () => {
  const artifact = { integrity: 'sha512-example' };
  const published = { ...voice, dist: artifact };
  assert.doesNotThrow(() => verifyPublished(voice, artifact, published));
  for (const change of [{ version: '0.1.2' }, { repository: {} }, { dist: { integrity: 'different' } }]) {
    assert.throws(() => verifyPublished(voice, artifact, { ...published, ...change }), /mismatch/);
  }
});
